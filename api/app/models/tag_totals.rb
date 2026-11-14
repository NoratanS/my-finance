# A user's tags with what each cost, earned and counted over a tag period: this month, or the last 3 or 12 calendar months.
class TagTotals
  # A span the Tags page doesn't offer; the API answers it with a 400.
  class Unknown < ArgumentError; end

  # Calendar months, this one included, as the query sends them.
  PERIODS = %w[ 1 3 12 ].freeze

  # All time, whatever the span; a link's created_at is when the tag was put on.
  LAST_USED_AT_COLUMN = "MAX(transaction_tags.created_at) AS last_used_at".freeze
  private_constant :LAST_USED_AT_COLUMN

  # Raw SQL: ActiveRecord has no FILTER. The dates sit inside FILTER, not WHERE, so a tag or group with nothing in the span
  # still comes back, at zero; SUM of a bigint is numeric, so it is cast back. Over rows joined to transactions.
  def self.totals_columns(dates)
    in_span = "transactions.date BETWEEN :from AND :to"
    [
      "COALESCE(SUM(transactions.amount) FILTER (WHERE #{in_span} AND transactions.kind = 'expense'), 0)::bigint AS expense",
      "COALESCE(SUM(transactions.amount) FILTER (WHERE #{in_span} AND transactions.kind = 'income'), 0)::bigint AS income",
      "COUNT(transactions.id) FILTER (WHERE #{in_span}) AS transaction_count"
    ].map { ActiveRecord::Base.sanitize_sql_array([ it, { from: dates.begin, to: dates.end } ]) }
  end

  # The last count calendar months, this one included, in config.time_zone so the span follows Warsaw's calendar.
  def self.last_months(count)
    (Date.current.beginning_of_month << (count - 1))..Date.current.end_of_month
  end

  # A tag period's dates; no period is this month.
  def self.dates(period)
    raise Unknown, :period unless period.nil? || PERIODS.include?(period)

    last_months((period || PERIODS.first).to_i)
  end

  attr_reader :period

  def initialize(user, period:)
    @dates = self.class.dates(period)
    @user = user
    @period = period || PERIODS.first
  end

  def meta
    { period:, untagged_count: }
  end

  # Over all time, whatever the period, so the page can offer them all for tagging.
  def untagged_count
    @user.transactions.untagged.count
  end

  # Most spent first, then most earned, then A–Z the Polish way; a tag that only earned goes last, after ones with nothing in the span.
  # Arel.sql: ActiveRecord's order hash can't take an expression or a collation, and both are fixed strings, nothing sent.
  def tags
    Tag.from(totalled, :tags)
      .order(Arel.sql("expense = 0 AND income > 0"), expense: :desc, income: :desc)
      .order(Arel.sql('normalized_name COLLATE "pl-x-icu"'), :id)
  end

  # Each transaction once per group, over the same span as the tags.
  def groups
    TagGroupTotals.new(@user, @dates).groups
  end

  private
    # A subquery, so the order can use its totals by name.
    def totalled
      @user.tags.left_joins(transaction_tags: :ledger_transaction).group(:id).select("tags.*", *self.class.totals_columns(@dates), LAST_USED_AT_COLUMN)
    end
end

# A user's tags with what each cost, earned and counted over a tag period: this month, or the last 3 or 12 calendar months.
class TagTotals
  # A span the Tags page doesn't offer; the API answers it with a 400.
  class Unknown < ArgumentError; end

  # Calendar months, this one included, as the query sends them.
  PERIODS = %w[ 1 3 12 ].freeze

  attr_reader :period

  # No period is this month.
  def initialize(tags, period:)
    raise Unknown, :period unless period.nil? || PERIODS.include?(period)

    @tags = tags
    @period = period || PERIODS.first
  end

  def meta
    { period: }
  end

  # Most spent first, then most earned, then A–Z; a tag that only earned goes last, after ones with nothing in the span.
  def tags
    Tag.from(totalled, :tags)
      .order(Arel.sql("expense = 0 AND income > 0"), expense: :desc, income: :desc, normalized_name: :asc, id: :asc)
  end

  private
    # A subquery, so the order can use its totals by name.
    def totalled
      @tags.left_joins(transaction_tags: :ledger_transaction).group(:id).select("tags.*", *totals_columns, last_used_at)
    end

    # All time, whatever the span; a link's created_at is when the tag was put on.
    def last_used_at
      "MAX(transaction_tags.created_at) AS last_used_at"
    end

    # In config.time_zone, so the span follows Warsaw's calendar.
    def dates
      (Date.current.beginning_of_month << (period.to_i - 1))..Date.current.end_of_month
    end

    # Raw SQL: ActiveRecord has no FILTER. The dates sit inside FILTER, not WHERE, so a tag with nothing in the span
    # still comes back, at zero; SUM of a bigint is numeric, so it is cast back.
    def totals_columns
      in_span = "transactions.date BETWEEN :from AND :to"
      [
        "COALESCE(SUM(transactions.amount) FILTER (WHERE #{in_span} AND transactions.kind = 'expense'), 0)::bigint AS expense",
        "COALESCE(SUM(transactions.amount) FILTER (WHERE #{in_span} AND transactions.kind = 'income'), 0)::bigint AS income",
        "COUNT(transactions.id) FILTER (WHERE #{in_span}) AS transaction_count"
      ].map { ActiveRecord::Base.sanitize_sql_array([ it, { from: dates.begin, to: dates.end } ]) }
    end
end

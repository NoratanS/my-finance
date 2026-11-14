# The transactions a list shows: one ledger narrowed to a period (a month, or all), a kind, tags and a description search.
class TransactionFilter
  # A value the list doesn't offer; the API answers it with a 400.
  class Unknown < ArgumentError; end

  MONTH = /\A\d{4}-(0[1-9]|1[0-2])\z/
  ALL = "all"

  attr_reader :period

  # No period is this month in config.time_zone, so the list follows Warsaw's calendar.
  def initialize(transactions, period: nil, kind: nil, q: nil, tag_ids: nil)
    @period = period.nil? ? Date.current.strftime("%Y-%m") : known(:period, period) { it == ALL || it.match?(MONTH) }
    @kind = kind && known(:kind, kind) { Transaction.kinds.key?(it) }
    # Postgres text can't hold NUL, so a search with one is refused rather than a 500.
    @q = q && known(:q, q) { it.exclude?("\u0000") }.strip
    @tag_ids = tag_ids&.uniq
    @transactions = transactions
  end

  def transactions
    in_period = period == ALL ? @transactions : @transactions.in_month(Date.strptime(period, "%Y-%m"))
    of_kind = @kind ? in_period.where(kind: @kind) : in_period
    tagged = @tag_ids ? of_kind.tagged_with_all(@tag_ids) : of_kind
    @q.blank? ? tagged : tagged.matching(@q)
  end

  def meta
    { period:, totals: }
  end

  # Summed by the database over every filtered row; net carries the sign.
  def totals
    sums = transactions.group(:kind).sum(:amount)
    expense, income = sums.values_at("expense", "income").map(&:to_i)
    { expense:, income:, net: income - expense }
  end

  private
    def known(name, value)
      raise Unknown, name unless value.is_a?(String) && yield(value)

      value
    end
end

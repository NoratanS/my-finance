# The transactions a list shows: one ledger narrowed to a period (a month, or all), a kind and a description search.
class TransactionFilter
  # A value the list doesn't offer; the API answers it with a 400.
  class Unknown < ArgumentError; end

  MONTH = /\A\d{4}-(0[1-9]|1[0-2])\z/
  ALL = "all"

  attr_reader :period

  # No period is this month in config.time_zone, so the list follows Warsaw's calendar.
  def initialize(transactions, period: nil, kind: nil, q: nil)
    @period = period.nil? ? Date.current.strftime("%Y-%m") : known(:period, period) { it == ALL || it.match?(MONTH) }
    @kind = kind && known(:kind, kind) { Transaction.kinds.key?(it) }
    # Postgres text can't hold NUL, so a search with one is refused rather than a 500.
    @q = q && known(:q, q) { it.exclude?("\u0000") }.strip
    @transactions = transactions
  end

  def transactions
    in_period = period == ALL ? @transactions : @transactions.in_month(Date.strptime(period, "%Y-%m"))
    of_kind = @kind ? in_period.where(kind: @kind) : in_period
    @q.blank? ? of_kind : of_kind.matching(@q)
  end

  def meta
    { period: }
  end

  private
    def known(name, value)
      raise Unknown, name unless value.is_a?(String) && yield(value)

      value
    end
end

# The transactions a list shows: one ledger narrowed to a period (a month, or all), a kind, tags (or none) and a description search.
class TransactionFilter
  # A value the list doesn't offer; the API answers it with a 400.
  class Unknown < ArgumentError; end

  MONTH = /\A\d{4}-(0[1-9]|1[0-2])\z/
  ID = /\A\d+\z/
  ALL = "all"

  attr_reader :period

  # No period is this month in config.time_zone, so the list follows Warsaw's calendar.
  def initialize(transactions, period: nil, kind: nil, q: nil, tag_ids: nil, untagged: nil)
    @period = period.nil? ? Date.current.strftime("%Y-%m") : known(:period, period) { it == ALL || it.match?(MONTH) }
    @kind = kind && known(:kind, kind) { Transaction.kinds.key?(it) }
    # Postgres text can't hold NUL, so a search with one is refused rather than a 500.
    @q = q && known(:q, q) { it.exclude?("\u0000") }.strip
    @tag_ids = tag_ids && known_ids(:tag_ids, tag_ids).uniq
    # Untagged with tags would always be empty, so the pair is refused rather than answered.
    @untagged = untagged && known(:untagged, untagged) { it == "true" && tag_ids.nil? }
    @transactions = transactions
  end

  def transactions
    in_period = period == ALL ? @transactions : @transactions.in_month(Date.strptime(period, "%Y-%m"))
    of_kind = @kind ? in_period.where(kind: @kind) : in_period
    tagged = if @untagged then of_kind.untagged
    elsif @tag_ids then of_kind.tagged_with_all(@tag_ids)
    else of_kind
    end
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

    # Query values arrive as strings: tag_ids[]=3&tag_ids[]=7.
    def known_ids(name, values)
      raise Unknown, name unless values.is_a?(Array) && values.all? { it.is_a?(String) && it.match?(ID) }

      values
    end
end

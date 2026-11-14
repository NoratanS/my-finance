# The transactions a list shows: one ledger narrowed to a period (a month, or all), a kind, tags (or none) and a description search.
class TransactionFilter
  # A value the list doesn't offer; the API answers it with a 400.
  class Unknown < ArgumentError; end

  MONTH = /\A\d{4}-(0[1-9]|1[0-2])\z/
  ID = /\A\d+\z/
  ALL = "all"

  attr_reader :period

  # Filters: period, kind, q, tag_ids, untagged; any left out lets every transaction through.
  # No period is this month in config.time_zone, so the list follows Warsaw's calendar.
  def initialize(transactions, **filters)
    period, kind, q = filters.values_at(:period, :kind, :q)
    @period = period.nil? ? Date.current.strftime("%Y-%m") : known(:period, period) { it == ALL || it.match?(MONTH) }
    @kind = kind && known(:kind, kind) { Transaction.kinds.key?(it) }
    # Postgres text can't hold NUL, so a search with one is refused rather than a 500.
    @q = q && known(:q, q) { it.exclude?("\u0000") }.strip
    @tags = tags_wanted(*filters.values_at(:tag_ids, :untagged))
    @transactions = transactions
  end

  def transactions
    in_period = period == ALL ? @transactions : @transactions.in_month(Date.strptime(period, "%Y-%m"))
    of_kind = @kind ? in_period.where(kind: @kind) : in_period
    of_tags = tagged(of_kind)
    @q.blank? ? of_tags : of_tags.matching(@q)
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
    def tagged(transactions)
      case @tags
      in nil then transactions
      in :untagged then transactions.untagged
      in Array then transactions.tagged_with_all(@tags)
      end
    end

    # Tag ids to match all of, :untagged, or nil. Both at once would always be empty, so the pair is refused.
    def tags_wanted(tag_ids, untagged)
      raise Unknown, :untagged if tag_ids && untagged
      if untagged
        known(:untagged, untagged) { it == "true" }
        :untagged
      else
        tag_ids && known_ids(:tag_ids, tag_ids).uniq
      end
    end

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

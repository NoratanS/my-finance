# The transactions a list shows: one ledger narrowed to a period (a month, or all), a kind, tags (or none) and a description search.
class TransactionFilter
  # A value the list doesn't offer; the API answers it with a 400.
  class Unknown < ArgumentError; end

  MONTH = /\A\d{4}-(0[1-9]|1[0-2])\z/
  # No leading zero, so 5 and 05 can't be two ids for one tag.
  ID = /\A[1-9]\d*\z/
  ALL = "all"

  # What a list request asks for: every filter named, nil when not sent.
  Query = Data.define(:period, :kind, :q, :tag_ids, :untagged)

  attr_reader :period

  def initialize(transactions, query)
    @period = period_from(query.period)
    @kind = query.kind && known(:kind, query.kind) { Transaction.kinds.key?(it) }
    # Postgres text can't hold NUL, so a search with one is refused rather than a 500.
    @q = query.q && known(:q, query.q) { it.exclude?("\u0000") }.strip
    @tags = tag_filter(query.tag_ids, query.untagged)
    @transactions = transactions
  end

  def transactions
    in_period = period == ALL ? @transactions : @transactions.in_month(Date.strptime(period, "%Y-%m"))
    of_kind = @kind ? in_period.where(kind: @kind) : in_period
    of_tags = tagged(of_kind)
    @q.blank? ? of_tags : of_tags.matching(@q)
  end

  def meta
    { period:, totals:, untagged_count: }
  end

  # Over the whole ledger, whatever the filters, so the Untagged toggle always says how many there are.
  def untagged_count
    @transactions.untagged.count
  end

  # Summed by the database over every filtered row; net carries the sign.
  def totals
    sums = transactions.group(:kind).sum(:amount)
    expense, income = sums.values_at("expense", "income").map(&:to_i)
    { expense:, income:, net: income - expense }
  end

  private
    # No period is this month in config.time_zone, so the list follows Warsaw's calendar.
    def period_from(period)
      period.nil? ? Date.current.strftime("%Y-%m") : known(:period, period) { it == ALL || it.match?(MONTH) }
    end

    def tagged(transactions)
      case @tags
      in nil then transactions
      in :untagged then transactions.untagged
      in Array then transactions.tagged_with_all(@tags)
      end
    end

    # Tag ids to carry all of, :untagged, or nil; together they could only list nothing, so the pair is refused.
    def tag_filter(tag_ids, untagged)
      raise Unknown, :untagged if tag_ids && untagged
      return :untagged if untagged && known(:untagged, untagged) { it == "true" }

      tag_ids && known_ids(:tag_ids, tag_ids).uniq
    end

    def known(name, value)
      raise Unknown, name unless value.is_a?(String) && yield(value)

      value
    end

    # Query values arrive as strings (tag_ids[]=3&tag_ids[]=7); more than a transaction carries is refused as sent.
    def known_ids(name, values)
      raise Unknown, name unless values.is_a?(Array) && values.size.between?(1, Transaction::MAX_TAGS)
      raise Unknown, name unless values.all? { it.is_a?(String) && it.match?(ID) }

      values
    end
end

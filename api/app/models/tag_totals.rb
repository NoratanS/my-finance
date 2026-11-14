# A user's tags with what each cost, earned and counted over a tag period: this month, or the last 3 or 12 calendar months.
class TagTotals
  def initialize(tags)
    @tags = tags
  end

  def tags
    @tags.left_joins(transaction_tags: :ledger_transaction).group(:id)
      .select("tags.*", *totals_columns, last_used_at)
      .order(:normalized_name, :id)
  end

  private
    # All time, whatever the span; a link's created_at is when the tag was put on.
    def last_used_at
      "MAX(transaction_tags.created_at) AS last_used_at"
    end

    def dates
      Date.current.all_month
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

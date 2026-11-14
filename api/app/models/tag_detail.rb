# One tag as its details panel shows it (GLOSSARY: Tag): its last 6 months, the tags it is often with over a tag period,
# and its newest transactions.
class TagDetail
  CHART_MONTHS = 6
  RECENT_COUNT = 3

  # A period the Tags page doesn't offer raises TagTotals::Unknown; no period is this month.
  def initialize(tag, period:)
    @tag = tag
    @dates = TagTotals.dates(period)
  end

  # Oldest first, "2026-06" to this month, whatever the tag period; a month with nothing comes back at zero.
  def months
    totals = monthly_totals
    (0...CHART_MONTHS).map { (chart_dates.begin >> it).strftime("%Y-%m") }.map do |month|
      { month:, expense: totals[month]&.expense || 0, income: totals[month]&.income || 0 }
    end
  end

  # Tags sharing a transaction with this one over the period, with how many: most first, then A–Z the Polish way.
  # Arel.sql: the order hash can't take an aggregate or a collation, and both are fixed strings, nothing sent.
  def often_with
    shared = @tag.transactions.where(date: @dates).select(:id)
    Tag.joins(:transaction_tags).where(transaction_tags: { transaction_id: shared }).where.not(id: @tag.id)
      .group(:id).select("tags.*", "COUNT(*) AS transaction_count")
      .order(Arel.sql("COUNT(*) DESC"), Arel.sql('tags.normalized_name COLLATE "pl-x-icu"'), :id)
  end

  # Each with its full set of tags, so a row can name the others.
  def recent
    @tag.transactions.newest_first.limit(RECENT_COUNT).includes(:tags)
  end

  # All time, whatever the period: what View all opens.
  def transaction_count
    @tag.transactions.count
  end

  private
    def chart_dates
      TagTotals.last_months(CHART_MONTHS)
    end

    # By "YYYY-MM", only months with a transaction.
    def monthly_totals
      @tag.transactions.where(date: chart_dates).group(:month)
        .select("to_char(transactions.date, 'YYYY-MM') AS month", *TagTotals.totals_columns(chart_dates)).index_by(&:month)
    end
end

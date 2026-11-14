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
    chart = TagTotals.last_months(CHART_MONTHS)
    totals = @tag.transactions.where(date: chart).group(:month)
      .select("to_char(transactions.date, 'YYYY-MM') AS month", *TagTotals.totals_columns(chart)).index_by(&:month)
    (0...CHART_MONTHS).map { (chart.begin >> it).strftime("%Y-%m") }
      .map { |month| { month:, expense: totals[month]&.expense || 0, income: totals[month]&.income || 0 } }
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
end

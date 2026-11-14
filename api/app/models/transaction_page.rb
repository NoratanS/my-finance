# One page of a list of transactions, by date then entry, newest first.
class TransactionPage
  PER_PAGE = 25

  attr_reader :page, :total_pages, :total_count

  # A page out of range or not a number shows the nearest one, so a stale link still lands somewhere.
  def initialize(transactions, page:)
    @transactions = transactions
    @total_count = transactions.count
    @total_pages = [ total_count.ceildiv(PER_PAGE), 1 ].max
    @page = page.to_s.to_i.clamp(1, total_pages)
  end

  def transactions
    @transactions.includes(:tags).newest_first.limit(PER_PAGE).offset((page - 1) * PER_PAGE)
  end

  def meta
    { page:, total_pages:, total_count: }
  end
end

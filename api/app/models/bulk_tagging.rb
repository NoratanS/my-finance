# GLOSSARY: Bulk tagging. Adds or removes tags across some of a user's transactions, never replacing a row's tags.
class BulkTagging
  Result = Data.define(:changed, :skipped_ids)
  Change = Data.define(:id, :tag_ids)

  def initialize(user, transaction_ids:, tag_ids:)
    @user = user
    @transaction_ids = transaction_ids.uniq
    @tag_ids = tag_ids.uniq
  end

  # A row the new tags would take past Transaction::MAX_TAGS is skipped whole.
  def add!
    write do |tag_ids, carried|
      fits, skipped = changes(carried) { tag_ids - it }.partition { carried[it.id].size + it.tag_ids.size <= Transaction::MAX_TAGS }
      insert_links(fits)
      Result.new(changed: fits, skipped_ids: skipped.map(&:id))
    end
  end

  private
    attr_reader :user

    # Locks as Transaction#retag! and Tag#merge_into! take them: tags, then rows, each in id order.
    # Only what the locks return goes on, so an id deleted or merged away meanwhile is ignored.
    def write
      ActiveRecord::Base.transaction do
        refuse_others
        tag_ids = user.tags.where(id: @tag_ids).order(:id).lock("FOR KEY SHARE").ids
        transaction_ids = user.transactions.where(id: @transaction_ids).order(:id).lock.ids
        yield tag_ids, carried_tags(transaction_ids)
      end
    end

    # Unscoped, unlike every other lookup: a gone id is ignored, so only this tells another user's apart, as a 404 before any write.
    def refuse_others
      others = [ Transaction.where(id: @transaction_ids), Tag.where(id: @tag_ids) ].map { it.where.not(user:) }
      raise ActiveRecord::RecordNotFound if others.any?(&:exists?)
    end

    # Each row's current tag ids, in row id order, read after the row locks.
    def carried_tags(transaction_ids)
      carried = transaction_ids.index_with { [] }
      TransactionTag.where(transaction_id: transaction_ids).pluck(:transaction_id, :tag_id).each { |id, tag_id| carried[id] << tag_id }
      carried
    end

    # created_at set here, as create! would: insert_all leaves it to the database clock.
    # Each row with the tags the write changes on it; a row it leaves as it was is in neither list.
    def changes(carried)
      carried.map { |id, current| Change.new(id:, tag_ids: yield(current)) }.reject { it.tag_ids.empty? }
    end

    def insert_links(changes)
      now = Time.current
      links = changes.flat_map { |change| change.tag_ids.map { { transaction_id: change.id, tag_id: it, created_at: now } } }
      TransactionTag.insert_all(links) if links.any? # rubocop:disable Rails/SkipsModelValidations -- one insert for every row; the unique index skips duplicates
    end
end

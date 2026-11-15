# GLOSSARY: Tag. The name is kept as typed; normalized_name is what makes two names one tag.
class Tag < ApplicationRecord
  COLOURS = %w[ lavender mint sky peach rose butter lilac seafoam ].freeze

  belongs_to :user
  # None is No group.
  belongs_to :tag_group, optional: true
  # The database cascades a deleted tag to its links.
  has_many :transaction_tags # rubocop:disable Rails/HasManyOrHasOneDependent
  has_many :transactions, through: :transaction_tags, source: :ledger_transaction

  include TagName

  validates :colour, inclusion: { in: COLOURS }, allow_nil: true

  # Changes only what is given; a new name follows the name rule. Returns the tag with this month's totals.
  def edit!(**changes)
    assign_attributes(changes.except(:name))
    changes.key?(:name) ? rename!(changes[:name]) : save!
    with_totals
  end

  # GLOSSARY: Merge. Its transactions get the target, then it is deleted: one row carrying both keeps only the target.
  # Returns the target with this month's totals.
  def merge_into!(target)
    refuse_merging_into_itself(target)
    transaction do
      # Rows locked in id order, as Transaction#retag! locks one, so a tag write on them waits for the merge.
      ids = Transaction.where(id: transaction_tags.select(:transaction_id)).order(:id).lock.ids
      move_links_to(target, ids)
      destroy!
    end
    target.with_totals
  end

  # As the tags index shows it this month, totals and all.
  def with_totals
    TagTotals.new(user, period: nil).tags.find(id)
  end

  def taken_message
    "You already have “#{name}”. Letter case and spaces don’t make a new tag."
  end

  private
    # A moved link keeps when the tag was put on, so the target's recently used holds; a row with the target already is skipped.
    def move_links_to(target, ids)
      links = transaction_tags.where(transaction_id: ids).map { { transaction_id: it.transaction_id, tag_id: target.id, created_at: it.created_at } }
      TransactionTag.insert_all(links) if links.any? # rubocop:disable Rails/SkipsModelValidations -- one insert for every row; the unique index skips duplicates
    end

    def refuse_merging_into_itself(target)
      return unless target == self

      errors.add(:target_id, "can’t be the tag itself")
      raise ActiveRecord::RecordInvalid, self
    end
end

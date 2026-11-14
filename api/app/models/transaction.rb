# GLOSSARY: Transaction. Amount in minor units, always positive; kind carries the sign (ADR 0006).
class Transaction < ApplicationRecord
  MAX_AMOUNT = 99_999_999_999
  # An older date would sit outside every list yet still lock the currency.
  FIRST_DATE = Date.new(2000, 1, 1)
  MAX_TAGS = 5

  # A tag_ids entry that is gone or another user's; the API answers it apart from a missing transaction.
  class TagNotFound < StandardError; end

  belongs_to :user
  # The database cascades a deleted transaction or tag to its links.
  has_many :transaction_tags, inverse_of: :ledger_transaction # rubocop:disable Rails/HasManyOrHasOneDependent
  has_many :tags, through: :transaction_tags

  enum :kind, { expense: "expense", income: "income" }, validate: true

  scope :in_month, ->(day) { where(date: day.all_month) }
  # Raw SQL: ActiveRecord has no unaccent or ILIKE. The search is bound, then escaped after unaccent,
  # since unaccent folds fullwidth ％ ＿ ＼ into the LIKE wildcards.
  scope :matching, lambda { |text|
    where(<<~SQL.squish, text)
      unaccent(description) ILIKE
        '%' || replace(replace(replace(unaccent(?), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%'
    SQL
  }
  # An id subquery, not a join, so a transaction carrying several of the tags is still one row in counts and totals.
  scope :tagged_with_all, lambda { |tag_ids|
    where(id: TransactionTag.where(tag_id: tag_ids).group(:transaction_id).having("COUNT(*) = ?", tag_ids.size).select(:transaction_id))
  }
  scope :newest_first, -> { order(date: :desc, id: :desc) }

  # "2026-10", newest first, with this month in config.time_zone even before it has a transaction.
  def self.months
    with_dates = distinct.pluck(Arel.sql("to_char(date, 'YYYY-MM')"))
    (with_dates | [ Date.current.strftime("%Y-%m") ]).sort.reverse
  end

  normalizes :description, with: ->(description) { description.strip }

  validates :amount, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_AMOUNT }
  validates :date, presence: true
  # Today in config.time_zone; no check constraint, since now() isn't immutable.
  validate { errors.add(:date, "can’t be after today") if date&.after?(Date.current) }
  validate { errors.add(:date, "can’t be before 2000") if date&.before?(FIRST_DATE) }
  validates :description, length: { maximum: 200 }
  # Postgres text can't hold NUL; refuse it as a field error instead of a 500, as User does for passwords.
  validate { errors.add(:description, "can’t contain a NUL character") if description&.include?("\u0000") }

  # Create and update alike, in one DB transaction, so a refused tag set saves no field either.
  def save_with_tags!(attributes, tag_ids:)
    transaction do
      update!(attributes)
      retag!(tag_ids)
    end
    self
  end

  # The row lock makes a concurrent write wait, so the re-count sees its links too.
  def retag!(tag_ids)
    transaction do
      lock!
      replace_links(owned_tag_ids(tag_ids.uniq))
      refuse_tags_over_limit
    end
    tags.reset
    self
  end

  private
    def owned_tag_ids(wanted)
      user.tags.where(id: wanted).ids.tap { raise TagNotFound if it.size < wanted.size }
    end

    # Only changed links are written, so a kept tag's created_at (its last use) survives an edit.
    def replace_links(wanted)
      current = transaction_tags.pluck(:tag_id)
      transaction_tags.where(tag_id: current - wanted).delete_all
      (wanted - current).each { transaction_tags.create!(tag_id: it) }
    end

    def refuse_tags_over_limit
      return if transaction_tags.count <= MAX_TAGS

      errors.add(:tag_ids, "can’t be more than #{MAX_TAGS}")
      raise ActiveRecord::RecordInvalid, self
    end
end

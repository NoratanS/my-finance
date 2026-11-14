# GLOSSARY: Transaction. Amount in minor units, always positive; kind carries the sign (ADR 0006).
class Transaction < ApplicationRecord
  MAX_AMOUNT = 99_999_999_999
  # An older date would sit outside every list yet still lock the currency.
  FIRST_DATE = Date.new(2000, 1, 1)

  belongs_to :user

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
end

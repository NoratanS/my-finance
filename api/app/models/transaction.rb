# GLOSSARY: Transaction. Amount in minor units, always positive; kind carries the sign (ADR 0006).
class Transaction < ApplicationRecord
  MAX_AMOUNT = 99_999_999_999
  # An older date would sit outside every list yet still lock the currency.
  FIRST_DATE = Date.new(2000, 1, 1)

  belongs_to :user

  enum :kind, { expense: "expense", income: "income" }, validate: true

  scope :in_month, ->(day) { where(date: day.all_month) }
  # Raw SQL: ActiveRecord has no unaccent or ILIKE; the search is bound and its % and _ escaped.
  scope :matching, ->(text) { where("unaccent(description) ILIKE unaccent(?)", "%#{sanitize_sql_like(text)}%") }
  scope :newest_first, -> { order(date: :desc, id: :desc) }

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

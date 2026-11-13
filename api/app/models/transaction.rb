# GLOSSARY: Transaction. Amount in minor units, always positive; kind carries the sign (ADR 0006).
class Transaction < ApplicationRecord
  MAX_AMOUNT = 99_999_999_999

  belongs_to :user

  enum :kind, { expense: "expense", income: "income" }, validate: true

  normalizes :description, with: ->(description) { description.strip }

  validates :amount, numericality: { only_integer: true, greater_than: 0, less_than_or_equal_to: MAX_AMOUNT }
  validates :date, presence: true
  # Today in config.time_zone; no check constraint, since now() isn't immutable.
  validate { errors.add(:date, "can’t be after today") if date&.after?(Date.current) }
  validates :description, length: { maximum: 200 }
end

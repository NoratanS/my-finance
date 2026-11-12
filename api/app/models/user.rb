class User < ApplicationRecord
  CURRENCIES = %w[ PLN EUR USD GBP CHF ].freeze

  has_secure_password
  has_many :sessions, dependent: :destroy
  has_many :invites, foreign_key: :created_by_id, inverse_of: :created_by, dependent: :delete_all

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  # Length only, no composition rules (ADR 0012, NIST SP 800-63B).
  validates :password, length: { minimum: 12 }, allow_nil: true
  validates :admin, uniqueness: true, if: :admin?
  validates :currency, inclusion: { in: CURRENCIES }
  validate { errors.add(:password, "can’t contain a NUL character") if @password_has_nul }

  # bcrypt raises on a NUL; refuse it as a field error instead of a 500.
  def password=(password)
    @password_has_nul = password.to_s.include?("\u0000")
    super unless @password_has_nul
  end

  # The only way to become admin (GLOSSARY: Admin); no endpoint sets the flag.
  def self.create_admin!(email:, password:)
    create!(email:, password:, admin: true)
  end
end

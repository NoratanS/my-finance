class User < ApplicationRecord
  has_secure_password
  has_many :sessions, dependent: :destroy

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  # Length only, no composition rules (ADR 0012, NIST SP 800-63B).
  validates :password, length: { minimum: 12 }, allow_nil: true
  validates :admin, uniqueness: true, if: :admin?

  # The only way to become admin (GLOSSARY: Admin); no endpoint sets the flag.
  def self.create_admin!(email:, password:)
    create!(email:, password:, admin: true)
  end
end

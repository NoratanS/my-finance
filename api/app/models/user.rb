class User < ApplicationRecord
  CURRENCIES = %w[ PLN EUR USD GBP CHF ].freeze

  has_secure_password reset_token: { expires_in: 24.hours }
  has_many :sessions, dependent: :destroy
  has_many :invites, foreign_key: :created_by_id, inverse_of: :created_by, dependent: :delete_all
  has_many :transactions, dependent: :delete_all

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  # Length only, no composition rules (ADR 0012, NIST SP 800-63B).
  validates :password, length: { minimum: 12 }, allow_nil: true
  validates :admin, uniqueness: true, if: :admin?
  validates :currency, inclusion: { in: CURRENCIES }
  validate { errors.add(:password, "can’t contain a NUL character") if @password_has_nul }
  # has_secure_password skips a blank password, which would keep the old one and leave a reset link alive.
  validates :password, presence: true, on: :password_change, unless: -> { @password_has_nul }

  # The API and the form call it current_password; Rails' check files it under password_challenge.
  after_validation do
    errors.where(:password_challenge).each { errors.import(it, attribute: :current_password) }
    errors.delete(:password_challenge)
  end

  # bcrypt raises on a NUL; refuse it as a field error instead of a 500.
  def password=(password)
    @password_has_nul = password.to_s.include?("\u0000")
    super unless @password_has_nul
  end

  # bcrypt raises on a NUL, and no password holds one (see password=), so such a challenge is simply wrong.
  def password_challenge=(challenge)
    super(challenge.to_s.include?("\u0000") ? "" : challenge)
  end

  # Expired, used (the password changed) and garbled tokens are all one dead link (#11).
  def self.from_reset_token!(token)
    find_by_token_for(:password_reset, token.to_s) or raise ActiveRecord::RecordNotFound
  end

  # Locked, then re-checked: a second use of the same link waits here and finds it dead (#11).
  # change_password! locks again; Postgres grants a lock this transaction already holds at once.
  def self.reset_password!(token:, password:)
    transaction { lock.from_reset_token!(token).change_password!(password) }
  end

  # A challenge must match the current password; every session but the kept one ends (ADR 0012).
  # Locked and reloaded first, so an overlapping change is checked against the password it replaced.
  def change_password!(password, challenge: nil, keeping: nil)
    with_lock do
      self.password, self.password_challenge = password, challenge
      save!(context: :password_change)
      sessions.excluding(keeping).delete_all
    end
    self
  end

  def reset_link
    ResetLink.new(email:, token: password_reset_token, expires_at: password_reset_token_expires_in.from_now)
  end

  # The only way to become admin (GLOSSARY: Admin); no endpoint sets the flag.
  def self.create_admin!(email:, password:)
    create!(email:, password:, admin: true)
  end
end

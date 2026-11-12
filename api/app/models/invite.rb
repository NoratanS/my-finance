# GLOSSARY: Invite. The raw token leaves only on the instance issue! returns; the table keeps its digest.
class Invite < ApplicationRecord
  VALID_FOR = 7.days

  # Accepting an invite that is no longer pending; the message names its state.
  class NotPending < StandardError; end

  belongs_to :created_by, class_name: "User", inverse_of: :invites

  normalizes :email, with: ->(email) { email.strip.downcase }

  validates :email, presence: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validate :email_has_no_account, on: :create, if: -> { errors.none? }

  scope :unaccepted, -> { where(accepted_at: nil) }
  scope :pending, -> { unaccepted.where(expires_at: Time.current..) }

  attr_accessor :token

  def self.digest(token)
    Digest::SHA256.hexdigest(token)
  end

  def self.from_token!(token)
    find_by!(token_digest: digest(token.to_s))
  end

  # Re-inviting replaces any unaccepted invite for the email, so only the newest link works.
  def self.issue!(email:, by:)
    token = SecureRandom.urlsafe_base64(32)
    invite = by.invites.new(email:, token:, token_digest: digest(token), expires_at: VALID_FOR.from_now)
    invite.validate!
    transaction do
      unaccepted.where(email: invite.email).delete_all
      invite.tap(&:save!)
    end
  end

  def status
    if accepted_at then "accepted"
    elsif expires_at.past? then "expired"
    else "pending"
    end
  end

  def accept!(password:, currency:)
    with_lock do
      raise NotPending, NOT_PENDING_TITLES.fetch(status) unless status == "pending"

      User.create!(email:, password:, currency:).tap { update!(accepted_at: Time.current) }
    end
  end

  NOT_PENDING_TITLES = { "expired" => "This invite has expired", "accepted" => "This invite was already used" }.freeze
  private_constant :NOT_PENDING_TITLES

  private
    def email_has_no_account
      errors.add(:email, "#{email} already has an account.") if User.exists?(email:)
    end
end

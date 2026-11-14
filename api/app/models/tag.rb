# GLOSSARY: Tag. The name is kept as typed; normalized_name is what makes two names one tag.
class Tag < ApplicationRecord
  COLOURS = %w[ lavender mint sky peach rose butter lilac seafoam ].freeze

  # Another of the user's tags already has this name, ignoring case and surrounding spaces.
  class NameTaken < StandardError
    attr_reader :existing

    def initialize(existing)
      @existing = existing
      super("You already have “#{existing.name}”. Letter case and spaces don’t make a new tag.")
    end
  end

  belongs_to :user

  # [[:space:]], not strip: strip keeps a no-break space, which the web form's trim removes.
  # NFC, so Ż typed as Z plus a combining dot is the same name as a composed Ż.
  normalizes :name, with: ->(name) { name.unicode_normalize(:nfc).gsub(/\A[[:space:]]+|[[:space:]]+\z/, "") }
  before_validation { self.normalized_name = name&.downcase }

  scope :a_to_z, -> { order(:normalized_name, :id) }

  # Called on a user's tags. Validated first, so a NUL never reaches the lookup.
  def self.add!(**attributes)
    tag = new(**attributes).tap(&:validate!)
    existing = find_by(normalized_name: tag.normalized_name)
    raise NameTaken, existing if existing

    # requires_new: a savepoint, so a lost race rolls back only this insert.
    transaction(requires_new: true) { tag.tap(&:save!) }
  rescue ActiveRecord::RecordNotUnique
    # Another request added the name between the lookup and the insert.
    raise NameTaken, find_by!(normalized_name: tag.normalized_name)
  end

  validates :name, presence: true, length: { maximum: 40 }
  # Postgres text can't hold NUL; refuse it as a field error instead of a 500, as Transaction does.
  validate { errors.add(:name, "can’t contain a NUL character") if name&.include?("\u0000") }
  validates :colour, inclusion: { in: COLOURS }, allow_nil: true
end

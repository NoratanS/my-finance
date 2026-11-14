# GLOSSARY: Tag, Tag group. One name rule for both: kept as typed, unique per user ignoring case and surrounding spaces, ≤ 40.
# The including model has user_id, name and normalized_name (unique per user), and says how a taken name reads (taken_message).
module TagName
  extend ActiveSupport::Concern

  # Another of the user's records already has this name.
  class Taken < StandardError
    attr_reader :existing

    def initialize(existing)
      @existing = existing
      super(existing.taken_message)
    end
  end

  included do
    # [[:space:]], not strip: strip keeps a no-break space, which the web form's trim removes.
    # NFC, so Ż typed as Z plus a combining dot is the same name as a composed Ż.
    normalizes :name, with: ->(name) { name.unicode_normalize(:nfc).gsub(/\A[[:space:]]+|[[:space:]]+\z/, "") }
    before_validation { self.normalized_name = name&.downcase }

    validates :name, presence: true, length: { maximum: 40 }
    # Postgres text can't hold NUL; refuse it as a field error instead of a 500, as Transaction does.
    validate { errors.add(:name, "can’t contain a NUL character") if name&.include?("\u0000") }
  end

  class_methods do
    # Called on a user's records. Validated first, so a NUL never reaches the lookup.
    def add!(**attributes)
      record = new(**attributes).tap(&:validate!)
      existing = find_by(normalized_name: record.normalized_name)
      raise Taken, existing if existing

      record.save_name!
    end
  end

  # Shops → SHOPS is the same record keeping its name, not a taken one.
  def rename!(name)
    self.name = name
    validate!
    existing = self.class.find_by(user_id:, normalized_name:)
    raise Taken, existing if existing && existing != self

    save_name!
  end

  # requires_new: a savepoint, so a lost race rolls back only this write.
  def save_name!
    self.class.transaction(requires_new: true) { save! }
    self
  rescue ActiveRecord::RecordNotUnique
    # Another request took the name between the lookup and the write.
    raise Taken, self.class.find_by!(user_id:, normalized_name:)
  end
end

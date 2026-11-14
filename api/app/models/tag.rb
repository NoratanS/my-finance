# GLOSSARY: Tag. The name is kept as typed; normalized_name is what makes two names one tag.
class Tag < ApplicationRecord
  COLOURS = %w[ lavender mint sky peach rose butter lilac seafoam ].freeze

  belongs_to :user

  # [[:space:]], not strip: strip keeps a no-break space, which the web form's trim removes.
  normalizes :name, with: ->(name) { name.gsub(/\A[[:space:]]+|[[:space:]]+\z/, "") }
  before_validation { self.normalized_name = name&.downcase }

  scope :a_to_z, -> { order(:normalized_name, :id) }

  validates :name, presence: true, length: { maximum: 40 }
  validates :colour, inclusion: { in: COLOURS }, allow_nil: true
end

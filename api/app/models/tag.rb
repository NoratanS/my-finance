# GLOSSARY: Tag. The name is kept as typed; normalized_name is what makes two names one tag.
class Tag < ApplicationRecord
  COLOURS = %w[ lavender mint sky peach rose butter lilac seafoam ].freeze

  belongs_to :user
  # The database cascades a deleted tag to its links.
  has_many :transaction_tags # rubocop:disable Rails/HasManyOrHasOneDependent
  has_many :transactions, through: :transaction_tags

  include TagName

  validates :colour, inclusion: { in: COLOURS }, allow_nil: true

  def taken_message
    "You already have “#{name}”. Letter case and spaces don’t make a new tag."
  end
end

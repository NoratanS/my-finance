# GLOSSARY: Tag. The name is kept as typed; normalized_name is what makes two names one tag.
class Tag < ApplicationRecord
  COLOURS = %w[ lavender mint sky peach rose butter lilac seafoam ].freeze

  belongs_to :user
  # None is No group.
  belongs_to :tag_group, optional: true
  # The database cascades a deleted tag to its links.
  has_many :transaction_tags # rubocop:disable Rails/HasManyOrHasOneDependent
  has_many :transactions, through: :transaction_tags, source: :ledger_transaction

  include TagName

  validates :colour, inclusion: { in: COLOURS }, allow_nil: true

  # Changes only what is given; a new name follows the name rule. Returns the tag with this month's totals.
  def edit!(**changes)
    assign_attributes(changes.except(:name))
    changes.key?(:name) ? rename!(changes[:name]) : save!
    with_totals
  end

  # As the tags index shows it this month, totals and all.
  def with_totals
    TagTotals.new(user, period: nil).tags.find(id)
  end

  def taken_message
    "You already have “#{name}”. Letter case and spaces don’t make a new tag."
  end
end

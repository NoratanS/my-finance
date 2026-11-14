# GLOSSARY: Tag group. Starts empty; deleting it leaves its tags in no group (the foreign key nullifies them).
class TagGroup < ApplicationRecord
  belongs_to :user
  has_many :tags # rubocop:disable Rails/HasManyOrHasOneDependent

  include TagName

  def taken_message
    "A group named “#{name}” already exists. Pick another name."
  end
end

class AddTagGroupToTags < ActiveRecord::Migration[8.1]
  def change
    # Deleting a group leaves its tags in no group, in the same statement.
    add_reference :tags, :tag_group, foreign_key: { on_delete: :nullify }
  end
end

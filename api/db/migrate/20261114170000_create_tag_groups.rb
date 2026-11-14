class CreateTagGroups < ActiveRecord::Migration[8.1]
  def change
    create_table :tag_groups do |t|
      # The unique index below covers lookups by user.
      t.references :user, null: false, foreign_key: true, index: false
      t.string :name, null: false
      # name trimmed and downcased in Ruby, as tags do (TagName).
      t.string :normalized_name, null: false
      t.timestamps

      t.check_constraint "char_length(name) BETWEEN 1 AND 40", name: "tag_groups_name_length"
      t.index [ :user_id, :normalized_name ], unique: true
    end
  end
end

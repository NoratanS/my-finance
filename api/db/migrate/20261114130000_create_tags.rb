class CreateTags < ActiveRecord::Migration[8.1]
  def change
    create_table :tags do |t|
      # The unique index below covers lookups by user.
      t.references :user, null: false, foreign_key: true, index: false
      t.string :name, null: false
      # name trimmed and downcased in Ruby; Postgres lower() can disagree with Ruby on Ż or Ł.
      t.string :normalized_name, null: false
      t.string :colour
      t.timestamps

      t.check_constraint "char_length(name) BETWEEN 1 AND 40", name: "tags_name_length"
      t.check_constraint "colour IN ('lavender', 'mint', 'sky', 'peach', 'rose', 'butter', 'lilac', 'seafoam')", name: "tags_colour_known"
      t.index [ :user_id, :normalized_name ], unique: true
    end
  end
end

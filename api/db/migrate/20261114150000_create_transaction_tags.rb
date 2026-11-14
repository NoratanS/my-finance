class CreateTransactionTags < ActiveRecord::Migration[8.1]
  def change
    create_table :transaction_tags do |t|
      # The unique pair below covers lookups by transaction.
      t.references :transaction, null: false, foreign_key: { on_delete: :cascade }, index: false
      t.references :tag, null: false, foreign_key: { on_delete: :cascade }
      # When the tag was put on; a tag's last_used_at is the newest of these.
      t.datetime :created_at, null: false

      t.index [ :transaction_id, :tag_id ], unique: true
    end
  end
end

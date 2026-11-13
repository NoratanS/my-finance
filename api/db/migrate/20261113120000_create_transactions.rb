class CreateTransactions < ActiveRecord::Migration[8.1]
  def change
    create_table :transactions do |t|
      # The composite index below covers lookups by user.
      t.references :user, null: false, foreign_key: true, index: false
      t.bigint :amount, null: false
      t.string :kind, null: false
      t.date :date, null: false
      t.string :description, null: false, default: ""
      t.timestamps

      # Minor units, positive, up to 999 999 999,99 (ADR 0006).
      t.check_constraint "amount > 0 AND amount <= 99999999999", name: "transactions_amount_range"
      t.check_constraint "kind IN ('expense', 'income')", name: "transactions_kind_known"
      t.check_constraint "char_length(description) <= 200", name: "transactions_description_length"
      t.index [ :user_id, :date, :id ], order: { date: :desc, id: :desc }
    end
  end
end

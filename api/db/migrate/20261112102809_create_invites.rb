class CreateInvites < ActiveRecord::Migration[8.1]
  def change
    create_table :invites do |t|
      t.string :email, null: false
      t.string :token_digest, null: false, index: { unique: true }
      t.datetime :expires_at, null: false
      t.datetime :accepted_at
      t.references :created_by, null: false, foreign_key: { to_table: :users }

      t.timestamps
    end
    # At most one unaccepted invite per email (PRD #5); issuing again replaces it.
    add_index :invites, :email, unique: true, where: "accepted_at IS NULL"
  end
end

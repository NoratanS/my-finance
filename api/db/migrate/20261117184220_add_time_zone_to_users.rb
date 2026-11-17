class AddTimeZoneToUsers < ActiveRecord::Migration[8.1]
  def change
    # Existing users (the owner, the smoke user) live in Poland (#65).
    add_column :users, :time_zone, :string, null: false, default: "Europe/Warsaw"
  end
end

# Search folds Polish letters ("zabka" finds "Żabka"); unaccent does it in the database.
class EnableUnaccent < ActiveRecord::Migration[8.1]
  def change
    enable_extension "unaccent"
  end
end

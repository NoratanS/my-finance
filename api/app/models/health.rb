Health = Data.define(:status) do
  def self.check
    # A real round trip: proves the database answers, not just that Rails booted.
    ActiveRecord::Base.with_connection { |connection| connection.select_value("SELECT 1") }
    new(status: 'ok')
  end
end

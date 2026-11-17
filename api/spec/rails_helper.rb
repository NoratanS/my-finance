require "spec_helper"
ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
abort("The Rails environment is running in production mode!") if Rails.env.production?
require "rspec/rails"
Rails.root.glob("spec/support/**/*.rb").each { require it }

begin
  ActiveRecord::Migration.maintain_test_schema!
rescue ActiveRecord::PendingMigrationError => e
  abort e.to_s.strip
end

RSpec.configure do |config|
  config.fixture_paths = [ Rails.root.join("spec/fixtures") ]
  config.use_transactional_fixtures = true
  config.filter_rails_from_backtrace!
  config.include FactoryBot::Syntax::Methods
  config.include ActiveSupport::Testing::TimeHelpers
  # Every request comes from 127.0.0.1, so one example's sign-ins or signups would rate-limit the next.
  # rswag specs send literal ids (31, 501, 4242…); start generated ids above them so the two never collide.
  config.before(:suite) do
    connection = ActiveRecord::Base.connection
    connection.tables.each do |table|
      next unless (sequence = connection.pk_and_sequence_for(table)&.last)

      connection.execute("SELECT setval('#{sequence}', GREATEST(100000, (SELECT last_value FROM #{sequence})))")
    end
  end

  config.before(type: :request) do
    AttemptLimit::ATTEMPTS.clear
  end
end

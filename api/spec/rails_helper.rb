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
  config.before(type: :request) do
    SessionsController::SIGN_IN_ATTEMPTS.clear
    SignupsController::SIGNUP_ATTEMPTS.clear
    PasswordResetsController::RESET_ATTEMPTS.clear
  end
end

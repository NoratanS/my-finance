require "io/console"

namespace :smoke do
  desc "Create the smoke user the post-deploy smoke test signs in as (prompts for email and password)"
  task create: :environment do
    print "Email: "
    email = $stdin.gets.to_s.strip
    print "Password (at least 12 characters): "
    # noecho needs a terminal; piped input (specs, scripts) is read as is.
    password = ($stdin.tty? ? $stdin.noecho(&:gets).tap { puts } : $stdin.gets).to_s.chomp

    user = User.create!(email:, password:)
    puts "Created smoke user #{user.email}. Never use it by hand: any data on it turns the smoke red."
  rescue ActiveRecord::RecordInvalid => e
    abort e.record.errors.full_messages.to_sentence
  end
end

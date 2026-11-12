require "io/console"

namespace :admin do
  desc "Create the admin, the one user who can invite (prompts for email and password)"
  task create: :environment do
    print "Email: "
    email = $stdin.gets.to_s.strip
    print "Password (at least 12 characters): "
    # noecho needs a terminal; piped input (specs, scripts) is read as is.
    password = ($stdin.tty? ? $stdin.noecho(&:gets).tap { puts } : $stdin.gets).to_s.chomp

    user = User.create_admin!(email:, password:)
    puts "Created admin #{user.email}."
  rescue ActiveRecord::RecordInvalid => e
    abort e.record.errors.full_messages.to_sentence
  end
end

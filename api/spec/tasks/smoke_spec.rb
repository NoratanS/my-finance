# frozen_string_literal: true

require "rails_helper"
require "rake"

RSpec.describe "bin/rails smoke:create", type: :task do
  # Feeds the prompts and swallows the task's own output.
  def run_task(input)
    Rails.application.load_tasks if Rake::Task.tasks.none?
    $stdin, $stdout, $stderr = StringIO.new(input), StringIO.new, StringIO.new
    Rake::Task["smoke:create"].tap(&:reenable).invoke
  ensure
    $stdin, $stdout, $stderr = STDIN, STDOUT, STDERR
  end

  it "creates a non-admin user who signs in with the prompted password" do
    run_task("smoke@example.com\ncorrect horse battery\n")

    expect(User.authenticate_by(email: "smoke@example.com", password: "correct horse battery")).not_to be_admin
  end

  it "refuses a password shorter than 12 characters" do
    expect { run_task("smoke@example.com\nshort\n") }
      .to raise_error(SystemExit).and(not_change(User, :count))
  end

  it "refuses an email that already has an account" do
    create(:user, email: "smoke@example.com")

    expect { run_task("smoke@example.com\ncorrect horse battery\n") }
      .to raise_error(SystemExit).and(not_change(User, :count))
  end
end

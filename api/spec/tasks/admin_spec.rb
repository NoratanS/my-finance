# frozen_string_literal: true

require "rails_helper"
require "rake"

RSpec::Matchers.define_negated_matcher :not_change, :change

RSpec.describe "bin/rails admin:create", type: :task do
  # Feeds the prompts and swallows the task's own output.
  def run_task(input)
    Rails.application.load_tasks if Rake::Task.tasks.none?
    $stdin, $stdout, $stderr = StringIO.new(input), StringIO.new, StringIO.new
    Rake::Task["admin:create"].tap(&:reenable).invoke
  ensure
    $stdin, $stdout, $stderr = STDIN, STDOUT, STDERR
  end

  it "creates the admin from the prompted email and password" do
    run_task("chris@example.com\ncorrect horse battery\n")

    expect(User.authenticate_by(email: "chris@example.com", password: "correct horse battery")).to be_admin
  end

  it "refuses a password shorter than 12 characters" do
    expect { run_task("chris@example.com\nshort\n") }
      .to raise_error(SystemExit).and(not_change(User, :count))
  end

  it "refuses a second admin" do
    create(:user, :admin)

    expect { run_task("chris@example.com\ncorrect horse battery\n") }
      .to raise_error(SystemExit).and(not_change(User, :count))
  end
end

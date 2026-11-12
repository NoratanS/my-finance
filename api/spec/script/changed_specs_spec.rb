require "spec_helper"
require_relative "../../script/changed_specs"

RSpec.describe ChangedSpecs do
  # Stands in for the working tree: only these spec files exist.
  def tree(*specs)
    ->(path) { specs.include?(path) }
  end

  it "runs a changed spec itself" do
    exists = tree("spec/models/budget_spec.rb")

    selection = described_class.for([ "api/spec/models/budget_spec.rb" ], exists:)

    expect(selection).to eq([ "spec/models/budget_spec.rb" ])
  end

  it "maps a file under app/ to its spec" do
    exists = tree("spec/models/budget_spec.rb")

    selection = described_class.for([ "api/app/models/budget.rb" ], exists:)

    expect(selection).to eq([ "spec/models/budget_spec.rb" ])
  end

  it "maps a file under lib/ to its spec" do
    exists = tree("spec/lib/vercel_hosts_spec.rb")

    selection = described_class.for([ "api/lib/vercel_hosts.rb" ], exists:)

    expect(selection).to eq([ "spec/lib/vercel_hosts_spec.rb" ])
  end

  it "maps a file under script/ to its spec" do
    exists = tree("spec/script/changed_specs_spec.rb")

    selection = described_class.for([ "api/script/changed_specs.rb" ], exists:)

    expect(selection).to eq([ "spec/script/changed_specs_spec.rb" ])
  end

  it "maps a controller to its request spec, keeping the namespace" do
    exists = tree("spec/requests/subscriptions/payments_spec.rb")

    selection = described_class.for([ "api/app/controllers/subscriptions/payments_controller.rb" ], exists:)

    expect(selection).to eq([ "spec/requests/subscriptions/payments_spec.rb" ])
  end

  it "runs the full suite when config, db, the Gemfile or spec setup changes" do
    full_suite_triggers = %w[api/config/routes.rb api/db/schema.rb api/Gemfile api/Gemfile.lock
                             api/spec/rails_helper.rb api/spec/swagger_helper.rb api/spec/support/auth.rb]

    selections = full_suite_triggers.map { |path| described_class.for([ path ], exists: tree) }

    expect(selections).to all(eq(:all))
  end

  it "runs the full suite when one of several changes needs it" do
    exists = tree("spec/models/budget_spec.rb")

    selection = described_class.for([ "api/app/models/budget.rb", "api/db/schema.rb" ], exists:)

    expect(selection).to eq(:all)
  end

  it "runs nothing for a file whose spec doesn't exist, such as a deleted one" do
    exists = tree

    selection = described_class.for([ "api/app/models/budget.rb", "api/spec/models/budget_spec.rb" ], exists:)

    expect(selection).to eq([])
  end

  it "runs nothing for files outside api/ or with no mapping" do
    exists = tree("spec/models/budget_spec.rb")

    selection = described_class.for([ "web/src/App.tsx", "README.md", "api/Dockerfile", "api/bin/ci" ], exists:)

    expect(selection).to eq([])
  end

  it "lists each spec once, sorted" do
    exists = tree("spec/models/budget_spec.rb", "spec/lib/vercel_hosts_spec.rb")

    selection = described_class.for(
      [ "api/spec/models/budget_spec.rb", "api/app/models/budget.rb", "api/lib/vercel_hosts.rb" ], exists:
    )

    expect(selection).to eq([ "spec/lib/vercel_hosts_spec.rb", "spec/models/budget_spec.rb" ])
  end
end

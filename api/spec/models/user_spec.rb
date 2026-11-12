require "rails_helper"

RSpec.describe User do
  it "keeps a ledger in one of the supported currencies only" do
    users = %w[ PLN EUR USD GBP CHF JPY pln ].map { build(:user, currency: it) }

    expect(users.map(&:valid?)).to eq([ true, true, true, true, true, false, false ])
  end
end

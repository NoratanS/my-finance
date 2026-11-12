require "rails_helper"

RSpec.describe User do
  it "keeps a ledger in one of the supported currencies only" do
    users = %w[ PLN EUR USD GBP CHF JPY pln ].map { build(:user, currency: it) }

    expect(users.map(&:valid?)).to eq([ true, true, true, true, true, false, false ])
  end

  it "turns a password containing NUL into a validation error, since bcrypt can't hash it" do
    user = build(:user, password: "correct horse\u0000battery")

    expect(user.tap(&:validate).errors[:password]).to include("can’t contain a NUL character")
  end
end

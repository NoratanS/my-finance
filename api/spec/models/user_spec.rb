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

  describe ".reset_password!" do
    it "sets the new password and ends every session of that user" do
      marta = create(:user, password: "correct horse battery")
      2.times { marta.sessions.create! }

      described_class.reset_password!(token: marta.password_reset_token, password: "a long and quiet evening")

      expect([ marta.reload.authenticate("a long and quiet evening").present?, marta.sessions.count ]).to eq([ true, 0 ])
    end

    it "kills the token once used" do
      token = create(:user).password_reset_token
      described_class.reset_password!(token:, password: "a long and quiet evening")

      expect { described_class.reset_password!(token:, password: "another long quiet evening") }.to raise_error(ActiveRecord::RecordNotFound)
    end

    it "takes a token just inside its 24 hours" do
      token = create(:user).password_reset_token
      travel 24.hours - 1.second

      expect { described_class.reset_password!(token:, password: "a long and quiet evening") }.not_to raise_error
    end

    it "refuses a token past its 24 hours" do
      token = create(:user).password_reset_token
      travel 24.hours + 1.second

      expect { described_class.reset_password!(token:, password: "a long and quiet evening") }.to raise_error(ActiveRecord::RecordNotFound)
    end

    it "refuses a blank password, keeping the old one and the sessions" do
      marta = create(:user, password: "correct horse battery")
      marta.sessions.create!

      expect { described_class.reset_password!(token: marta.password_reset_token, password: "") }
        .to raise_error(ActiveRecord::RecordInvalid, /Password can't be blank/)
        .and not_change { marta.sessions.count }
    end
  end
end

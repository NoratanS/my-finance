require "rails_helper"

RSpec.describe Invite do
  describe ".issue!" do
    it "returns a token that finds the invite, storing only its digest" do
      admin = create(:user, :admin)

      invite = described_class.issue!(email: " Piotr@Example.com", by: admin)

      expect(described_class.from_token!(invite.token)).to have_attributes(
        id: invite.id, email: "piotr@example.com", token_digest: Digest::SHA256.hexdigest(invite.token)
      )
    end

    it "makes the invite valid for 7 days" do
      travel_to Time.zone.local(2026, 11, 10, 12)
      admin = create(:user, :admin)

      invite = described_class.issue!(email: "piotr@example.com", by: admin)

      expect(invite.expires_at).to eq(Time.zone.local(2026, 11, 17, 12))
    end

    it "replaces an unaccepted invite for the same email, expired or not" do
      admin = create(:user, :admin)
      pending = create(:invite, email: "piotr@example.com", created_by: admin)
      expired = create(:invite, :expired, email: "kasia@example.com", created_by: admin)

      [ "piotr@example.com", "kasia@example.com" ].each { described_class.issue!(email: it, by: admin) }

      expect(described_class.where(id: [ pending.id, expired.id ])).to be_empty
    end

    it "wins a race with another invite for the same email by replacing it once more" do
      admin = create(:user, :admin)
      create(:invite, email: "piotr@example.com", created_by: admin)
      # The first replace misses the other request's row, as if it was inserted after the delete.
      deletes = 0
      allow(described_class).to receive(:unaccepted)
        .and_wrap_original { |original| (deletes += 1) == 1 ? described_class.none : original.call }

      invite = described_class.issue!(email: "piotr@example.com", by: admin)

      expect(described_class.where(email: "piotr@example.com")).to eq([ invite ])
    end

    it "refuses an email that already has an account" do
      admin = create(:user, :admin)
      create(:user, email: "marta@example.com")

      expect { described_class.issue!(email: "Marta@example.com", by: admin) }
        .to raise_error(ActiveRecord::RecordInvalid, /marta@example.com already has an account\./)
    end
  end

  describe ".from_token!" do
    it "finds nothing for an unknown token" do
      create(:invite, token: "known-token")

      expect { described_class.from_token!("unknown-token") }.to raise_error(ActiveRecord::RecordNotFound)
    end

    it "finds nothing for a token that isn't a string" do
      create(:invite, token: "known-token")

      [ 123456789012, { "x" => "known-token" } ].each do |token|
        expect { described_class.from_token!(token) }.to raise_error(ActiveRecord::RecordNotFound)
      end
    end
  end

  describe "#status" do
    it "is pending until it expires, then expired; accepted wins over expiry" do
      travel_to Time.zone.local(2026, 11, 10, 12)
      invites = [ build(:invite), build(:invite, :expired), build(:invite, :accepted, expires_at: 1.day.ago) ]

      expect(invites.map(&:status)).to eq(%w[ pending expired accepted ])
    end
  end

  describe ".pending" do
    it "holds only unaccepted, unexpired invites" do
      pending = create(:invite)
      create(:invite, :expired)
      create(:invite, :accepted)

      expect(described_class.pending).to eq([ pending ])
    end
  end

  describe "#accept!" do
    it "creates the user with the invite's email and marks the invite accepted" do
      invite = create(:invite, email: "piotr@example.com")

      user = invite.accept!(password: "correct horse battery", currency: "EUR")

      expect([ user, invite.reload.accepted_at ]).to match([
        have_attributes(email: "piotr@example.com", currency: "EUR", persisted?: true), be_present
      ])
    end

    it "refuses an expired invite, naming the state" do
      invite = create(:invite, :expired)

      expect { invite.accept!(password: "correct horse battery", currency: "PLN") }
        .to raise_error(Invite::NotPending, "This invite has expired")
    end

    it "refuses a used invite, naming the state" do
      invite = create(:invite, :accepted)

      expect { invite.accept!(password: "correct horse battery", currency: "PLN") }
        .to raise_error(Invite::NotPending, "This invite was already used")
    end

    it "refuses a password shorter than 12 characters and keeps the invite pending" do
      invite = create(:invite)

      expect { invite.accept!(password: "sunflower", currency: "PLN") }
        .to raise_error(ActiveRecord::RecordInvalid, /Password is too short/).and(not_change { invite.reload.status })
    end
  end
end

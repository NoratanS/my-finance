require "rails_helper"

RSpec.describe Transaction, type: :model do
  describe "#retag!" do
    # Two connections only see each other's committed rows, so this group writes for real and cleans up.
    self.use_transactional_tests = false

    after do
      [ TransactionTag, described_class, Tag, User ].each(&:delete_all)
    end

    it "waits while another write holds the row, then replaces the set, so two writes can't reach 6 tags" do
      marta = create(:user)
      tags = create_list(:tag, 6, user: marta)
      transaction = create(:transaction, user: marta, tags: tags.first(4))

      retagged = while_another_write_adds(tags[4], to: transaction) { described_class.find(transaction.id).retag!(tags.values_at(0, 1, 2, 3, 5).map(&:id)) }

      expect([ retagged.tags.count, transaction.tags.reload ]).to eq([ 5, tags.values_at(0, 1, 2, 3, 5) ])
    end

    it "says the tag is gone when it is deleted while the write waits for it, rather than failing on the foreign key" do
      marta = create(:user)
      party = create(:tag, user: marta)
      transaction = create(:transaction, user: marta)

      outcome = while_another_write(holds: ->(holder) { holder.exec_query("DELETE FROM tags WHERE id = $1", "Delete", [ party.id ]) }) do
        described_class.find(transaction.id).retag!([ party.id ])
      rescue described_class::TagNotFound, ActiveRecord::InvalidForeignKey => error
        error.class
      end

      expect([ outcome, transaction.tags.reload ]).to eq([ described_class::TagNotFound, [] ])
    end

    it "says the tag is gone when a merge folds it away while the write waits for it" do
      marta = create(:user)
      restaurant, eating_out = create_list(:tag, 2, user: marta)
      transaction = create(:transaction, user: marta)

      outcome = while_another_write(holds: ->(holder) { merge_away(holder, restaurant, into: eating_out) }) do
        described_class.find(transaction.id).retag!([ restaurant.id ])
      rescue described_class::TagNotFound, ActiveRecord::InvalidForeignKey => error
        error.class
      end

      expect([ outcome, transaction.tags.reload ]).to eq([ described_class::TagNotFound, [] ])
    end

    it "refuses a 6th tag once the other write has committed, and keeps that write's 5" do
      marta = create(:user)
      tags = create_list(:tag, 6, user: marta)
      transaction = create(:transaction, user: marta, tags: tags.first(4))

      refused = while_another_write_adds(tags[4], to: transaction) do
        described_class.find(transaction.id).retag!(tags.map(&:id))
      rescue ActiveRecord::RecordInvalid => invalid
        invalid.record.errors.to_hash
      end

      expect([ refused, transaction.tags.reload ]).to eq([ { tag_ids: [ "can’t be more than 5" ] }, tags.first(5) ])
    end

    def while_another_write_adds(tag, to:, &)
      while_another_write(holds: ->(holder) { lock_and_add(holder, tag, to) }, &)
    end

    # As Tag#merge_into! does once it has moved the links.
    def merge_away(holder, tag, into:)
      holder.select_values("SELECT id FROM tags WHERE id IN ($1, $2) ORDER BY id FOR UPDATE", "Lock", [ tag.id, into.id ])
      holder.exec_query("DELETE FROM tags WHERE id = $1", "Delete", [ tag.id ])
    end

    def lock_and_add(holder, tag, transaction)
      holder.select_value("SELECT id FROM transactions WHERE id = $1 FOR UPDATE", "Lock", [ transaction.id ])
      holder.exec_query("INSERT INTO transaction_tags (transaction_id, tag_id, created_at) VALUES ($1, $2, now())", "Link", [ transaction.id, tag.id ])
    end
  end
end

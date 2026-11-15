require "rails_helper"

RSpec.describe BulkTagging, type: :model do
  # Two connections only see each other's committed rows, so this group writes for real and cleans up.
  self.use_transactional_tests = false

  after do
    [ TransactionTag, Transaction, Tag, User ].each(&:delete_all)
  end

  describe "#add!" do
    it "waits while a retag holds the row, then skips it once that retag has taken it to 5" do
      marta = create(:user)
      tags = create_list(:tag, 6, user: marta)
      transaction = create(:transaction, user: marta, tags: tags.first(4))
      retag = ->(holder) { lock_and_add(holder, tags[4], transaction) }

      result = while_another_write(holds: retag) { described_class.new(marta, transaction_ids: [ transaction.id ], tag_ids: [ tags[5].id ]).add! }

      expect([ result.skipped_ids, transaction.tags.reload ]).to eq([ [ transaction.id ], tags.first(5) ])
    end

    it "ignores a tag deleted while the write waits for it, rather than failing on the foreign key" do
      marta = create(:user)
      party, wine = create_list(:tag, 2, user: marta)
      transaction = create(:transaction, user: marta)
      delete = ->(holder) { holder.exec_query("DELETE FROM tags WHERE id = $1", "Delete", [ party.id ]) }

      result = while_another_write(holds: delete) { described_class.new(marta, transaction_ids: [ transaction.id ], tag_ids: [ party.id, wine.id ]).add! }

      expect([ result.changed.map(&:tag_ids), transaction.tags.reload ]).to eq([ [ [ wine.id ] ], [ wine ] ])
    end

    it "ignores a tag a merge folds away while the write waits for it" do
      marta = create(:user)
      restaurant, eating_out = create_list(:tag, 2, user: marta)
      transaction = create(:transaction, user: marta)

      result = while_another_write(holds: ->(holder) { merge_away(holder, restaurant, into: eating_out) }) do
        described_class.new(marta, transaction_ids: [ transaction.id ], tag_ids: [ restaurant.id ]).add!
      end

      expect([ result.changed, transaction.tags.reload ]).to eq([ [], [] ])
    end

    it "ignores a transaction deleted while the write waits for it" do
      marta = create(:user)
      groceries = create(:tag, user: marta)
      rent, salary = create_list(:transaction, 2, user: marta)
      delete = ->(holder) { holder.exec_query("DELETE FROM transactions WHERE id = $1", "Delete", [ rent.id ]) }

      result = while_another_write(holds: delete) { described_class.new(marta, transaction_ids: [ rent.id, salary.id ], tag_ids: [ groceries.id ]).add! }

      expect(result.changed.map(&:id)).to eq([ salary.id ])
    end
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

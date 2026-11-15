require "rails_helper"

RSpec.describe Tag, type: :model do
  describe "#merge_into!" do
    self.use_transactional_tests = false

    after do
      [ TransactionTag, Transaction, described_class, User ].each(&:delete_all)
    end

    it "waits for a write putting the tag on another transaction, then moves that link too" do
      marta = create(:user)
      restaurant, eating_out = create_list(:tag, 2, user: marta)
      create(:transaction, user: marta, tags: [ restaurant ])
      late = create(:transaction, user: marta)
      retag = lambda do |holder|
        holder.select_value("SELECT id FROM transactions WHERE id = $1 FOR UPDATE", "Lock", [ late.id ])
        holder.exec_query("INSERT INTO transaction_tags (transaction_id, tag_id, created_at) VALUES ($1, $2, now())", "Link", [ late.id, restaurant.id ])
      end

      while_another_write(holds: retag) { described_class.find(restaurant.id).merge_into!(described_class.find(eating_out.id)) }

      expect(late.tags.reload).to eq([ eating_out ])
    end
  end
end

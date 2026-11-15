# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Tag merges", type: :request do
  path "/api/tags/{tag_id}/merges" do
    parameter name: :tag_id, in: :path, schema: { type: :integer }, description: "The tag merged away"

    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Merges one of the signed-in user's tags into another: its transactions get the target, then it is deleted" do
      tags "Tags"
      operationId "mergeTag"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :merge, in: :body, schema: { "$ref" => "#/components/schemas/TagMergeInput" }

      response "201", "merged: the target, with its totals this month" do
        schema "$ref" => "#/components/schemas/Tag"
        let(:tag_id) { 4242 }
        let(:merge) { { target_id: 77 } }

        before do
          marta = create(:user, password: "correct horse battery")
          restaurant, eating_out, wine = [ 4242, 77, 78 ].map { create(:tag, id: it, user: marta) }
          create(:transaction, id: 501, user: marta, amount: 3_000, tags: [ restaurant, wine ])
          create(:transaction, id: 502, user: marta, amount: 1_000, tags: [ restaurant, eating_out ])
          create(:transaction, id: 503, user: marta, amount: 500, tags: [ eating_out ])
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect([ response.parsed_body.values_at("id", "expense", "transaction_count"), Tag.exists?(4242),
                   [ 501, 502, 503 ].map { Transaction.find(it).tag_ids.sort } ])
            .to eq([ [ 77, 4_500, 3 ], false, [ [ 77, 78 ], [ 77 ], [ 77 ] ] ])
        end
      end

      response "404", "the tag merged away is another user's" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:tag_id) { 4242 }
        let(:merge) { { target_id: 77 } }

        before do
          create(:tag, id: 4242)
          marta = create(:user, password: "correct horse battery")
          create(:tag, id: 77, user: marta)
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do
          expect(Tag.exists?(4242)).to be(true)
        end
      end

      response "422", "a tag can't merge into itself" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:tag_id) { 4242 }
        let(:merge) { { target_id: 4242 } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:transaction, user: marta, tags: [ create(:tag, id: 4242, user: marta) ])
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect([ response.parsed_body["errors"].keys, Tag.find(4242).transaction_tags.count ]).to eq([ [ "target_id" ], 1 ])
        end
      end

      response "400", "target_id is missing or not an integer" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:tag_id) { 4242 }
        let(:merge) { { target_id: "77" } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:tag, id: 4242, user: marta)
          sign_in_as marta, password: "correct horse battery"
        end

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:tag_id) { 4242 }
        let(:merge) { { target_id: 77 } }

        run_test!
      end
    end
  end

  describe "merging a tag" do
    it "keeps both tags when the target is another user's" do
      theirs = create(:tag)
      marta = create(:user, password: "correct horse battery")
      party = create(:tag, user: marta, name: "Party")
      create(:transaction, user: marta, tags: [ party ])
      sign_in_as marta, password: "correct horse battery"

      post "/api/tags/#{party.id}/merges", params: { target_id: theirs.id }, as: :json

      expect([ response.status, party.reload.transaction_tags.count, theirs.reload.transaction_tags.count ]).to eq([ 404, 1, 0 ])
    end

    it "keeps when each moved transaction got the source as when it got the target, so recently used holds" do
      marta = create(:user, password: "correct horse battery")
      restaurant, eating_out = [ "Restaurant", "Eating out" ].map { create(:tag, user: marta, name: it) }
      travel_to(Time.utc(2026, 10, 1, 12)) { create(:transaction, user: marta, tags: [ restaurant ]) }
      travel_to Time.utc(2026, 11, 14, 12)
      sign_in_as marta, password: "correct horse battery"

      post "/api/tags/#{restaurant.id}/merges", params: { target_id: eating_out.id }, as: :json

      expect(eating_out.transaction_tags.sole.created_at).to eq(Time.utc(2026, 10, 1, 12))
    end
  end
end

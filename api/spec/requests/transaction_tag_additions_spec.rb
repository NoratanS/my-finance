# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Transaction tag additions", type: :request do
  path "/api/transaction_tag_additions" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Adds tags to some of the signed-in user's transactions, keeping the tags they carry" do
      tags "Transactions"
      operationId "addTransactionTags"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :addition, in: :body, schema: { "$ref" => "#/components/schemas/BulkTaggingInput" }

      response "201", "added: each changed row with the tags it got; a row that would pass 5 tags is skipped whole" do
        schema "$ref" => "#/components/schemas/BulkTagging"
        let(:addition) { { transaction_ids: [ 505, 504, 503, 502, 501 ], tag_ids: [ 32, 31 ] } }

        before do
          marta = create(:user, password: "correct horse battery")
          groceries, biedronka = [ 31, 32 ].map { create(:tag, id: it, user: marta) }
          others = create_list(:tag, 5, user: marta)
          create(:transaction, id: 501, user: marta)
          create(:transaction, id: 502, user: marta, tags: [ groceries ])
          create(:transaction, id: 503, user: marta, tags: others)
          create(:transaction, id: 504, user: marta, tags: others.first(4))
          create(:transaction, id: 505, user: marta, tags: [ groceries, biedronka ])
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect([ response.parsed_body, [ 501, 502, 504 ].map { Transaction.find(it).tag_ids.size } ])
            .to eq([ { "changed" => [ { "id" => 501, "tag_ids" => [ 31, 32 ] }, { "id" => 502, "tag_ids" => [ 32 ] } ], "skipped_ids" => [ 503, 504 ] },
                     [ 2, 2, 4 ] ])
        end
      end

      response "404", "a transaction or tag is another user's; nothing is written" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:addition) { { transaction_ids: [ 501, 502 ], tag_ids: [ 31 ] } }

        before do
          create(:transaction, id: 502)
          marta = create(:user, password: "correct horse battery")
          create(:tag, id: 31, user: marta)
          create(:transaction, id: 501, user: marta)
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do
          expect(TransactionTag.count).to eq(0)
        end
      end

      response "400", "a list is missing, empty, too long or not whole numbers" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:addition) { { transaction_ids: [], tag_ids: [ 31 ] } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:addition) { { transaction_ids: [ 501 ], tag_ids: [ 31 ] } }

        run_test!
      end
    end
  end

  describe "adding tags in bulk" do
    it "refuses another user's tag among the user's own, writing nothing" do
      theirs = create(:tag)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      post "/api/transaction_tag_additions", params: { transaction_ids: [ transaction.id ], tag_ids: [ create(:tag, user: marta).id, theirs.id ] }, as: :json

      expect([ response.status, TransactionTag.count ]).to eq([ 404, 0 ])
    end

    it "ignores transactions and tags that are gone, however large their ids" do
      marta = create(:user, password: "correct horse battery")
      groceries = create(:tag, user: marta)
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      post "/api/transaction_tag_additions", params: { transaction_ids: [ transaction.id, 4242, ("9" * 30).to_i ], tag_ids: [ groceries.id, 4343, ("9" * 30).to_i ] }, as: :json

      expect([ response.status, response.parsed_body["changed"], transaction.tags.reload ]).to eq([ 201, [ { "id" => transaction.id, "tag_ids" => [ groceries.id ] } ], [ groceries ] ])
    end

    it "refuses lists that are absent, empty, past their limit or not whole numbers" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"
      bodies = [ { tag_ids: [ 1 ] }, { transaction_ids: [ 1 ] }, { transaction_ids: [ 1 ], tag_ids: [] }, { transaction_ids: (1..26).to_a, tag_ids: [ 1 ] },
                 { transaction_ids: [ 1 ], tag_ids: (1..6).to_a }, { transaction_ids: [ "1" ], tag_ids: [ 1 ] }, { transaction_ids: [ 1, nil ], tag_ids: [ 1 ] },
                 { transaction_ids: 1, tag_ids: [ 1 ] } ]

      statuses = bodies.map { post("/api/transaction_tag_additions", params: it, as: :json) && response.status }

      expect(statuses).to all(eq(400))
    end

    it "refuses a body that isn't JSON as a problem, not a crash" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      post "/api/transaction_tag_additions", params: "{", headers: { "CONTENT_TYPE" => "application/json" }

      expect([ response.status, response.media_type ]).to eq([ 400, "application/problem+json" ])
    end

    it "takes a full page of rows and five tags, sent twice over" do
      marta = create(:user, password: "correct horse battery")
      tags = create_list(:tag, 5, user: marta)
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      post "/api/transaction_tag_additions", params: { transaction_ids: [ transaction.id ] * 25, tag_ids: tags.map(&:id) }, as: :json

      expect([ response.status, transaction.tags.reload.size ]).to eq([ 201, 5 ])
    end

    it "dates each new link now, so the tags count as recently used" do
      travel_to Time.utc(2026, 11, 14, 12)
      marta = create(:user, password: "correct horse battery")
      groceries = create(:tag, user: marta)
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      post "/api/transaction_tag_additions", params: { transaction_ids: [ transaction.id ], tag_ids: [ groceries.id ] }, as: :json

      expect(groceries.transaction_tags.sole.created_at).to eq(Time.utc(2026, 11, 14, 12))
    end
  end
end

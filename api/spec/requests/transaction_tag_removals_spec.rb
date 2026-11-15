# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Transaction tag removals", type: :request do
  path "/api/transaction_tag_removals" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Removes tags from some of the signed-in user's transactions, keeping their other tags; Undo of an addition" do
      tags "Transactions"
      operationId "removeTransactionTags"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :removal, in: :body, schema: { "$ref" => "#/components/schemas/BulkTaggingInput" }

      response "201", "removed: each changed row with the tags it lost; nothing is skipped" do
        schema "$ref" => "#/components/schemas/BulkTagging"
        let(:removal) { { transaction_ids: [ 503, 502, 501 ], tag_ids: [ 32, 31 ] } }

        before do
          marta = create(:user, password: "correct horse battery")
          groceries, biedronka, food = [ 31, 32, 33 ].map { create(:tag, id: it, user: marta) }
          create(:transaction, id: 501, user: marta, tags: [ groceries, biedronka, food ])
          create(:transaction, id: 502, user: marta, tags: [ biedronka ])
          create(:transaction, id: 503, user: marta, tags: [ food ])
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect([ response.parsed_body, [ 501, 502, 503 ].map { Transaction.find(it).tag_ids } ])
            .to eq([ { "changed" => [ { "id" => 501, "tag_ids" => [ 31, 32 ] }, { "id" => 502, "tag_ids" => [ 32 ] } ], "skipped_ids" => [] },
                     [ [ 33 ], [], [ 33 ] ] ])
        end
      end

      response "404", "a transaction or tag is another user's; nothing is removed" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:removal) { { transaction_ids: [ 501 ], tag_ids: [ 31, 32 ] } }

        before do
          create(:tag, id: 32)
          marta = create(:user, password: "correct horse battery")
          create(:transaction, id: 501, user: marta, tags: [ create(:tag, id: 31, user: marta) ])
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do
          expect(TransactionTag.count).to eq(1)
        end
      end

      response "400", "a list is missing, empty, too long or not whole numbers" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:removal) { { transaction_ids: [ 501 ], tag_ids: (1..6).to_a } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:removal) { { transaction_ids: [ 501 ], tag_ids: [ 31 ] } }

        run_test!
      end
    end
  end

  describe "removing tags in bulk" do
    it "refuses another user's transaction among the user's own, removing nothing" do
      theirs = create(:transaction)
      marta = create(:user, password: "correct horse battery")
      groceries = create(:tag, user: marta)
      transaction = create(:transaction, user: marta, tags: [ groceries ])
      sign_in_as marta, password: "correct horse battery"

      post "/api/transaction_tag_removals", params: { transaction_ids: [ transaction.id, theirs.id ], tag_ids: [ groceries.id ] }, as: :json

      expect([ response.status, transaction.tags.reload ]).to eq([ 404, [ groceries ] ])
    end

    it "ignores transactions and tags deleted since they were added, so Undo still works" do
      marta = create(:user, password: "correct horse battery")
      groceries = create(:tag, user: marta)
      transaction = create(:transaction, user: marta, tags: [ groceries ])
      sign_in_as marta, password: "correct horse battery"

      post "/api/transaction_tag_removals", params: { transaction_ids: [ transaction.id, 4242 ], tag_ids: [ groceries.id, 4343 ] }, as: :json

      expect([ response.status, response.parsed_body["changed"], transaction.tags.reload ]).to eq([ 201, [ { "id" => transaction.id, "tag_ids" => [ groceries.id ] } ], [] ])
    end
  end
end

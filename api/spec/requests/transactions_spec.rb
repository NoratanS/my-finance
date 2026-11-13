# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Transactions", type: :request do
  path "/api/transactions" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Records an expense or income in the signed-in user's ledger" do
      tags "Transactions"
      operationId "createTransaction"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :transaction, in: :body, schema: {
        type: :object,
        properties: {
          amount: { type: :integer, description: "Minor units (grosze, cents), always positive" },
          kind: { "$ref" => "#/components/schemas/Kind" },
          date: { type: :string, format: :date },
          description: { type: :string }
        },
        required: %w[ amount kind date ]
      }

      response "201", "recorded" do
        schema "$ref" => "#/components/schemas/Transaction"
        let(:transaction) { { amount: 220_000, kind: "income", date: "2026-10-10", description: "  October salary " } }

        before do
          travel_to Time.utc(2026, 10, 10, 12)
          sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to include(
            "amount" => 220_000, "kind" => "income", "date" => "2026-10-10", "description" => "October salary"
          )
        end
      end

      response "422", "a rule is broken: amount, kind, date or description" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:transaction) { { amount: 0, kind: "expense", date: "2026-10-11", description: "x" * 201 } }

        before do
          travel_to Time.utc(2026, 10, 10, 12)
          sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"
        end

        run_test! do |response|
          expect(response).to have_attributes(
            media_type: "application/problem+json",
            parsed_body: include("status" => 422, "errors" => include("amount", "date", "description"))
          )
        end
      end

      response "400", "the amount is missing or not a whole number of minor units" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:transaction) { { amount: 12.5, kind: "expense", date: "2026-10-10" } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:transaction) { { amount: 100, kind: "expense", date: "2026-10-10" } }

        run_test!
      end
    end
  end

  describe "adding a transaction" do
    before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

    it "refuses amounts of zero and above 999 999 999,99, and accepts the largest" do
      statuses = [ 0, 99_999_999_999, 100_000_000_000 ].map do |amount|
        post "/api/transactions", params: { amount:, kind: "expense", date: Date.current.iso8601 }, as: :json
        response.status
      end

      expect(statuses).to eq([ 422, 201, 422 ])
    end

    it "refuses an amount sent as a fraction or a string, since amounts are minor units" do
      statuses = [ 12.5, "1250", nil ].map do |amount|
        post "/api/transactions", params: { amount:, kind: "expense", date: Date.current.iso8601 }, as: :json
        response.status
      end

      expect(statuses).to eq([ 400, 400, 400 ])
    end

    it "refuses a kind other than expense or income" do
      post "/api/transactions", params: { amount: 100, kind: "transfer", date: Date.current.iso8601 }, as: :json

      expect(response.parsed_body["errors"]).to eq("kind" => [ "is not included in the list" ])
    end

    it "refuses a date after today in Warsaw, and takes today there while it is still yesterday in UTC" do
      travel_to Time.utc(2026, 10, 31, 23, 30)

      statuses = [ "2026-11-02", "2026-11-01" ].map do |date|
        post "/api/transactions", params: { amount: 100, kind: "expense", date: }, as: :json
        response.status
      end

      expect(statuses).to eq([ 422, 201 ])
    end

    it "trims the description and counts at most 200 characters after trimming" do
      post "/api/transactions", params: { amount: 100, kind: "expense", date: Date.current.iso8601, description: " #{"x" * 200} " }, as: :json

      expect(response.parsed_body["description"]).to eq("x" * 200)
    end

    it "keeps no description as an empty one" do
      post "/api/transactions", params: { amount: 100, kind: "expense", date: Date.current.iso8601 }, as: :json

      expect(response.parsed_body["description"]).to eq("")
    end
  end
end

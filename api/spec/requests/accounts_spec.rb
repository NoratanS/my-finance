# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Account", type: :request do
  path "/api/account" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    patch "Changes the signed-in user's own settings: their ledger's currency" do
      tags "Account"
      operationId "updateAccount"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :account, in: :body, schema: {
        type: :object,
        properties: { currency: { "$ref" => "#/components/schemas/Currency" } },
        required: %w[ currency ]
      }

      response "200", "currency changed" do
        schema "$ref" => "#/components/schemas/Session"
        let(:account) { { currency: "EUR" } }

        before do
          sign_in_as create(:user, email: "marta@example.com", password: "correct horse battery"), password: "correct horse battery"
        end

        # No block argument: it would shadow `response`, which the follow-up request replaces.
        run_test! do
          changed = response.parsed_body
          get "/api/session"

          expect([ changed, response.parsed_body ]).to all(eq("email" => "marta@example.com", "admin" => false, "currency" => "EUR", "currency_locked" => false))
        end
      end

      response "422", "a currency the ledger can't use" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:account) { { currency: "JPY" } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test! do |response|
          expect(response.parsed_body["errors"]).to eq("currency" => [ "is not included in the list" ])
        end
      end

      response "422", "the ledger already has a transaction, so its currency is locked" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:account) { { currency: "EUR" } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:transaction, user: marta)
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body["errors"]).to eq("currency" => [ "can’t change after your first transaction" ])
        end
      end

      response "400", "the currency is missing, blank or not a string" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:account) { { currency: "" } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:account) { { currency: "EUR" } }

        run_test!
      end
    end
  end

  describe "details" do
    it "keeps my currency open while only another user has transactions" do
      create(:transaction)
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/account", params: { currency: "EUR" }, as: :json

      expect(response.parsed_body).to include("currency" => "EUR", "currency_locked" => false)
    end

    it "leaves another user's currency alone" do
      ola = create(:user, currency: "PLN")
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/account", params: { currency: "EUR" }, as: :json

      expect(ola.reload.currency).to eq("PLN")
    end
  end
end

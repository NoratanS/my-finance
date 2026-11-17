# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Account", type: :request do
  path "/api/account" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    patch "Changes the signed-in user's own settings: their ledger's currency, their time zone, or both" do
      tags "Account"
      operationId "updateAccount"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :account, in: :body, schema: {
        type: :object,
        properties: { currency: { "$ref" => "#/components/schemas/Currency" }, time_zone: { "$ref" => "#/components/schemas/TimeZone" } },
        minProperties: 1
      }

      response "200", "the settings sent changed; the rest stay as they were" do
        schema "$ref" => "#/components/schemas/Session"
        let(:account) { { currency: "EUR" } }

        before do
          sign_in_as create(:user, email: "marta@example.com", password: "correct horse battery"), password: "correct horse battery"
        end

        # No block argument: it would shadow `response`, which the follow-up request replaces.
        run_test! do
          changed = response.parsed_body
          get "/api/session"

          expect([ changed, response.parsed_body ]).to all(
            eq("email" => "marta@example.com", "admin" => false, "currency" => "EUR", "currency_locked" => false, "time_zone" => "Europe/Warsaw")
          )
        end
      end

      response "422", "a currency the ledger can't use, any currency change once the ledger has a transaction, or an unknown time zone" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:account) { { currency: "JPY" } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test! do |response|
          expect(response.parsed_body["errors"]).to eq("currency" => [ "is not included in the list" ])
        end
      end

      response "400", "neither setting sent, or one blank or not a string" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:account) { {} }

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
    it "locks the currency once the ledger has a transaction" do
      marta = create(:user, password: "correct horse battery")
      create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/account", params: { currency: "EUR" }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("errors" => { "currency" => [ "can’t change after your first transaction" ] }))
    end

    it "keeps my currency open while only another user has transactions" do
      create(:transaction)
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/account", params: { currency: "EUR" }, as: :json

      expect(response.parsed_body).to include("currency" => "EUR", "currency_locked" => false)
    end

    it "changes only my time zone, keeping the currency, even once the ledger has a transaction" do
      marta = create(:user, password: "correct horse battery", currency: "EUR")
      create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/account", params: { time_zone: "Pacific/Auckland" }, as: :json

      expect(response).to have_attributes(status: 200, parsed_body: include("currency" => "EUR", "time_zone" => "Pacific/Auckland"))
    end

    it "takes a legacy zone name a browser may offer" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/account", params: { time_zone: "Europe/Kiev" }, as: :json

      expect(response.parsed_body).to include("time_zone" => "Europe/Kiev")
    end

    it "refuses an unknown time zone with a field error" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/account", params: { time_zone: "Mars/Olympus" }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("errors" => { "time_zone" => [ "is not included in the list" ] }))
    end

    it "refuses a blank currency" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/account", params: { currency: "" }, as: :json

      expect(response).to have_attributes(status: 400, parsed_body: include("title" => "Send every required field"))
    end

    it "leaves another user's currency alone" do
      ola = create(:user, currency: "PLN")
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/account", params: { currency: "EUR" }, as: :json

      expect(ola.reload.currency).to eq("PLN")
    end
  end
end

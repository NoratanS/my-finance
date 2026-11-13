# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Transactions", type: :request do
  path "/api/transactions" do
    get "Lists the signed-in user's transactions this month, newest first, 25 a page" do
      tags "Transactions"
      operationId "listTransactions"
      produces "application/json", "application/problem+json"
      parameter name: :page, in: :query, type: :integer, required: false, description: "From 1; out of range shows the nearest page"

      response "200", "this month's page, by date then entry, newest first" do
        schema "$ref" => "#/components/schemas/TransactionPage"

        before do
          travel_to Time.utc(2026, 10, 10, 12)
          marta = create(:user, password: "correct horse battery")
          [ [ "Rent", "2026-10-03" ], [ "Fuel", "2026-10-09" ], [ "Drinks", "2026-10-09" ], [ "Last month", "2026-09-30" ] ]
            .each { |description, date| create(:transaction, user: marta, description:, date:) }
          create(:transaction, description: "Someone else's", date: "2026-10-10")
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to match(
            "data" => [ include("description" => "Drinks"), include("description" => "Fuel"), include("description" => "Rent") ],
            "meta" => { "page" => 1, "total_pages" => 1, "total_count" => 3 }
          )
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"

        run_test!
      end
    end

    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Records an expense or income in the signed-in user's ledger" do
      tags "Transactions"
      operationId "createTransaction"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :transaction, in: :body, schema: { "$ref" => "#/components/schemas/TransactionInput" }

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

  path "/api/transactions/{id}" do
    parameter name: :id, in: :path, type: :integer

    patch "Replaces every field of one of the signed-in user's transactions" do
      tags "Transactions"
      operationId "updateTransaction"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :transaction, in: :body, schema: { "$ref" => "#/components/schemas/TransactionInput" }

      response "200", "saved" do
        schema "$ref" => "#/components/schemas/Transaction"
        let(:id) { 4242 }
        let(:transaction) { { amount: 8_420, kind: "expense", date: "2026-10-09", description: " Groceries " } }

        before do
          travel_to Time.utc(2026, 10, 10, 12)
          marta = create(:user, password: "correct horse battery")
          create(:transaction, id: 4242, user: marta, amount: 220_000, kind: "income", date: "2026-10-01", description: "Salary")
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to eq(
            "id" => 4242, "amount" => 8_420, "kind" => "expense", "date" => "2026-10-09", "description" => "Groceries"
          )
        end
      end

      response "422", "a rule is broken: amount, kind, date or description" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }
        let(:transaction) { { amount: 0, kind: "expense", date: "2026-10-11", description: "x" * 201 } }

        before do
          travel_to Time.utc(2026, 10, 10, 12)
          marta = create(:user, password: "correct horse battery")
          create(:transaction, id: 4242, user: marta)
          sign_in_as marta, password: "correct horse battery"
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
        let(:id) { 4242 }
        let(:transaction) { { amount: 12.5, kind: "expense", date: "2026-10-10" } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:transaction, id: 4242, user: marta)
          sign_in_as marta, password: "correct horse battery"
        end

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }
        let(:transaction) { { amount: 100, kind: "expense", date: "2026-10-10" } }

        run_test!
      end

      response "404", "no such transaction, or another user's" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }
        let(:transaction) { { amount: 100, kind: "income", date: "2026-10-10", description: "Mine now" } }

        before do
          travel_to Time.utc(2026, 10, 10, 12)
          create(:transaction, id: 4242, amount: 5_000, kind: "expense", date: "2026-10-01", description: "Theirs")
          sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"
        end

        run_test! do
          expect(Transaction.find(4242)).to have_attributes(amount: 5_000, kind: "expense", description: "Theirs")
        end
      end
    end

    delete "Deletes one of the signed-in user's transactions" do
      tags "Transactions"
      operationId "deleteTransaction"
      produces "application/problem+json"

      response "204", "deleted" do
        let(:id) { 4242 }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:transaction, id: 4242, user: marta)
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do
          expect(Transaction.exists?(4242)).to be(false)
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }

        run_test!
      end

      response "404", "no such transaction, or another user's" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }

        before do
          create(:transaction, id: 4242)
          sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"
        end

        run_test! do
          expect(Transaction.exists?(4242)).to be(true)
        end
      end
    end
  end

  describe "listing transactions" do
    it "pages 25 at a time" do
      marta = create(:user, password: "correct horse battery")
      create_list(:transaction, 26, user: marta)
      sign_in_as marta, password: "correct horse battery"

      get "/api/transactions", params: { page: 2 }

      expect(response.parsed_body).to include("data" => [ be_a(Hash) ], "meta" => { "page" => 2, "total_pages" => 2, "total_count" => 26 })
    end

    it "shows the nearest page for a page out of range or not a number" do
      marta = create(:user, password: "correct horse battery")
      create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      pages = [ "0", "abc", "9" * 30 ].map { get("/api/transactions", params: { page: it }) && response.parsed_body["meta"]["page"] }

      expect(pages).to eq([ 1, 1, 1 ])
    end

    it "says page 1 of 1 when the month is empty" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      get "/api/transactions"

      expect(response.parsed_body).to eq("data" => [], "meta" => { "page" => 1, "total_pages" => 1, "total_count" => 0 })
    end

    it "follows the month in Warsaw, which starts while it is still last month in UTC" do
      travel_to Time.utc(2026, 10, 31, 23, 30)
      marta = create(:user, password: "correct horse battery")
      create(:transaction, user: marta, date: "2026-10-31", description: "October")
      create(:transaction, user: marta, date: "2026-11-01", description: "November")
      sign_in_as marta, password: "correct horse battery"

      get "/api/transactions"

      expect(response.parsed_body["data"]).to contain_exactly(include("description" => "November"))
    end
  end

  describe "adding a transaction" do
    before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

    it "refuses amounts of zero and above 999 999 999,99, and accepts the largest" do
      statuses = [ 0, 99_999_999_999, 100_000_000_000, 10**20 ].map do |amount|
        post "/api/transactions", params: { amount:, kind: "expense", date: Date.current.iso8601 }, as: :json
        response.status
      end

      expect(statuses).to eq([ 422, 201, 422, 422 ])
    end

    it "refuses an amount sent as a fraction or a string, since amounts are minor units" do
      statuses = [ 12.5, "1250", nil ].map do |amount|
        post "/api/transactions", params: { amount:, kind: "expense", date: Date.current.iso8601 }, as: :json
        response.status
      end

      expect(statuses).to eq([ 400, 400, 400 ])
    end

    it "refuses a date that isn't a YYYY-MM-DD string" do
      statuses = [ 20_261_010, "10/10/2026", "2026-10-10T12:00", nil ].map do |date|
        post "/api/transactions", params: { amount: 100, kind: "expense", date: }, as: :json
        response.status
      end

      expect(statuses).to eq([ 400, 400, 400, 400 ])
    end

    it "refuses a date before 2000, which would hide from every list but still lock the currency" do
      statuses = [ "0026-11-13", "1999-12-31", "2000-01-01" ].map do |date|
        post "/api/transactions", params: { amount: 100, kind: "expense", date: }, as: :json
        response.status
      end

      expect(statuses).to eq([ 422, 422, 201 ])
    end

    it "refuses a description that isn't a string" do
      statuses = [ { "a" => 1 }, [ "a" ], 12 ].map do |description|
        post "/api/transactions", params: { amount: 100, kind: "expense", date: Date.current.iso8601, description: }, as: :json
        response.status
      end

      expect(statuses).to eq([ 400, 400, 400 ])
    end

    it "refuses a NUL in the description as a field error" do
      post "/api/transactions", params: { amount: 100, kind: "expense", date: Date.current.iso8601, description: "a\u0000b" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "errors" => { "description" => [ "can’t contain a NUL character" ] })
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

  describe "editing a transaction" do
    it "answers another user's transaction with a 404 even when the body is broken" do
      theirs = create(:transaction)
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/transactions/#{theirs.id}", params: { amount: "x" }, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "keeps no description as an empty one" do
      travel_to Time.utc(2026, 10, 10, 12)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta, description: "Rent")
      sign_in_as marta, password: "correct horse battery"

      patch "/api/transactions/#{transaction.id}", params: { amount: 100, kind: "expense", date: "2026-10-10" }, as: :json

      expect(response.parsed_body["description"]).to eq("")
    end

    it "refuses an amount of zero, as adding does" do
      travel_to Time.utc(2026, 10, 10, 12)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/transactions/#{transaction.id}", params: { amount: 0, kind: "expense", date: "2026-10-10" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "errors" => { "amount" => [ "must be greater than 0" ] })
    end

    it "refuses an amount above 999 999 999,99, as adding does" do
      travel_to Time.utc(2026, 10, 10, 12)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/transactions/#{transaction.id}", params: { amount: 100_000_000_000, kind: "expense", date: "2026-10-10" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "errors" => { "amount" => [ "must be less than or equal to 99999999999" ] })
    end

    it "refuses a kind other than expense or income, as adding does" do
      travel_to Time.utc(2026, 10, 10, 12)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/transactions/#{transaction.id}", params: { amount: 100, kind: "transfer", date: "2026-10-10" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "errors" => { "kind" => [ "is not included in the list" ] })
    end

    it "refuses a date after today, as adding does" do
      travel_to Time.utc(2026, 10, 10, 12)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/transactions/#{transaction.id}", params: { amount: 100, kind: "expense", date: "2026-10-11" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "errors" => { "date" => [ "can’t be after today" ] })
    end

    it "refuses a date before 2000, as adding does" do
      travel_to Time.utc(2026, 10, 10, 12)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/transactions/#{transaction.id}", params: { amount: 100, kind: "expense", date: "1999-12-31" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "errors" => { "date" => [ "can’t be before 2000" ] })
    end

    it "refuses a description over 200 characters, as adding does" do
      travel_to Time.utc(2026, 10, 10, 12)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/transactions/#{transaction.id}", params: { amount: 100, kind: "expense", date: "2026-10-10", description: "x" * 201 }, as: :json

      expect(response.parsed_body).to include("status" => 422, "errors" => { "description" => [ "is too long (maximum is 200 characters)" ] })
    end

    it "refuses a NUL in the description, as adding does" do
      travel_to Time.utc(2026, 10, 10, 12)
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      patch "/api/transactions/#{transaction.id}", params: { amount: 100, kind: "expense", date: "2026-10-10", description: "a\u0000b" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "errors" => { "description" => [ "can’t contain a NUL character" ] })
    end
  end

  describe "deleting a transaction" do
    it "unlocks the currency when the last transaction goes" do
      marta = create(:user, password: "correct horse battery")
      transaction = create(:transaction, user: marta)
      sign_in_as marta, password: "correct horse battery"

      delete "/api/transactions/#{transaction.id}"

      expect(marta).not_to be_currency_locked
    end
  end
end

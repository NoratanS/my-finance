# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Transaction months", type: :request do
  path "/api/transaction_months" do
    get "Lists the months the signed-in user's transactions fall in, and this month, newest first" do
      tags "Transactions"
      operationId "listTransactionMonths"
      produces "application/json", "application/problem+json"

      response "200", "months as YYYY-MM, newest first; this month (in Warsaw) even when it has none" do
        schema type: :array, items: { type: :string, pattern: "^\\d{4}-(0[1-9]|1[0-2])$" }

        before do
          travel_to Time.utc(2026, 10, 10, 12)
          marta = create(:user, password: "correct horse battery")
          %w[ 2026-08-31 2026-08-01 2025-12-24 2026-09-15 ].each { create(:transaction, user: marta, date: it) }
          create(:transaction, date: "2026-07-01")
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to eq(%w[ 2026-10 2026-09 2026-08 2025-12 ])
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"

        run_test!
      end
    end
  end

  it "lists this month once when it has transactions" do
    travel_to Time.utc(2026, 10, 10, 12)
    marta = create(:user, password: "correct horse battery")
    create_list(:transaction, 2, user: marta, date: "2026-10-01")
    sign_in_as marta, password: "correct horse battery"

    get "/api/transaction_months"

    expect(response.parsed_body).to eq(%w[ 2026-10 ])
  end

  it "follows the month in Warsaw, which starts while it is still last month in UTC" do
    travel_to Time.utc(2026, 10, 31, 23, 30)
    sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

    get "/api/transaction_months"

    expect(response.parsed_body).to eq(%w[ 2026-11 ])
  end
end

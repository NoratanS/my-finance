# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Signups", type: :request do
  path "/api/signups/{token}" do
    parameter name: :token, in: :path, type: :string

    get "Shows the invite behind a signup link" do
      tags "Signups"
      operationId "getSignup"
      produces "application/json", "application/problem+json"

      response "200", "the invite's email, state and expiry" do
        schema "$ref" => "#/components/schemas/Signup"
        let(:token) { "piotrs-token" }

        before do
          travel_to Time.zone.local(2026, 11, 10, 12)
          create(:invite, email: "piotr@example.com", token: "piotrs-token")
        end

        run_test! do |response|
          expect(response.parsed_body).to eq(
            "email" => "piotr@example.com", "status" => "pending", "expires_at" => "2026-11-17T12:00:00.000Z"
          )
        end
      end

      response "404", "unknown or revoked link" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:token) { "revoked-token" }

        before { create(:invite, token: "another-token") }

        run_test!
      end
    end
  end

  path "/api/signups" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Accepts an invite: creates the user and signs them in" do
      tags "Signups"
      operationId "createSignup"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :signup, in: :body, schema: {
        type: :object,
        properties: {
          token: { type: :string },
          password: { type: :string },
          currency: { "$ref" => "#/components/schemas/Currency" }
        },
        required: %w[ token password currency ]
      }

      response "201", "signed in as the new user; the session cookie is set" do
        schema "$ref" => "#/components/schemas/Session"
        let(:signup) { { token: "piotrs-token", password: "tea before the long walk", currency: "EUR" } }

        before { create(:invite, email: "piotr@example.com", token: "piotrs-token") }

        run_test! do
          get "/api/session"

          expect(response.parsed_body).to eq("email" => "piotr@example.com", "admin" => false, "currency" => "EUR")
        end
      end

      response "422", "a password under 12 characters or an unknown currency" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:signup) { { token: "piotrs-token", password: "sunflower", currency: "JPY" } }

        before { create(:invite, token: "piotrs-token") }

        run_test! do |response|
          expect(response.parsed_body["errors"]).to eq(
            "password" => [ "is too short (minimum is 12 characters)" ], "currency" => [ "is not included in the list" ]
          )
        end
      end

      response "422", "the invite has expired" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:signup) { { token: "piotrs-token", password: "tea before the long walk", currency: "PLN" } }

        before { create(:invite, :expired, token: "piotrs-token") }

        run_test! do |response|
          expect(response.parsed_body).to include("status" => 422, "title" => "This invite has expired")
        end
      end

      response "422", "the invite was already used" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:signup) { { token: "piotrs-token", password: "tea before the long walk", currency: "PLN" } }

        before { create(:invite, :accepted, token: "piotrs-token") }

        run_test! do |response|
          expect(response.parsed_body).to include("status" => 422, "title" => "This invite was already used")
        end
      end

      response "404", "unknown or revoked link" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:signup) { { token: "revoked-token", password: "tea before the long walk", currency: "PLN" } }

        run_test!
      end
    end
  end

  # Behaviour beyond the documented responses; each example sets up only its own data.
  describe "details" do
    it "shows an expired invite as expired" do
      create(:invite, :expired, token: "piotrs-token")

      get "/api/signups/piotrs-token"

      expect(response.parsed_body["status"]).to eq("expired")
    end

    it "shows a used invite as accepted, even past its expiry" do
      create(:invite, :accepted, token: "piotrs-token", expires_at: 1.day.ago)

      get "/api/signups/piotrs-token"

      expect(response.parsed_body["status"]).to eq("accepted")
    end

    it "lets a link create only one account" do
      create(:invite, email: "piotr@example.com", token: "piotrs-token")
      body = { token: "piotrs-token", password: "tea before the long walk", currency: "PLN" }

      2.times { post "/api/signups", params: body, as: :json }

      expect([ response.status, User.where(email: "piotr@example.com").count ]).to eq([ 422, 1 ])
    end

    it "answers malformed fields with field errors, not a server error" do
      create(:invite, token: "piotrs-token")

      post "/api/signups", params: { token: "piotrs-token", password: "a\u0000b" * 6, currency: { "$ne" => "" } }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("errors" => include("currency")))
    end
  end
end

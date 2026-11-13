# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Signups", type: :request do
  # The token travels as a query parameter or in the body, never in the path, so the log filter masks it.
  path "/api/signup" do
    get "Shows the invite behind a signup link" do
      tags "Signups"
      operationId "getSignup"
      produces "application/json", "application/problem+json"
      parameter name: :token, in: :query, type: :string, required: true

      response "200", "the invite's email, state and expiry" do
        schema "$ref" => "#/components/schemas/Signup"
        let(:token) { "piotrs-token" }

        before do
          travel_to Time.utc(2026, 11, 10, 12)
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

      response "422", "invalid fields, or the invite expired or was used (the title says which)" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:signup) { { token: "piotrs-token", password: "sunflower", currency: "JPY" } }

        before { create(:invite, token: "piotrs-token") }

        run_test! do |response|
          expect(response.parsed_body["errors"]).to eq(
            "password" => [ "is too short (minimum is 12 characters)" ], "currency" => [ "is not included in the list" ]
          )
        end
      end

      response "400", "the password is missing, blank or not a string; the invite stays pending" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:signup) { { token: "piotrs-token", password: 123456789012, currency: "PLN" } }

        before { create(:invite, token: "piotrs-token") }

        run_test! do |response|
          expect(response.parsed_body).to include("status" => 400, "title" => "Send every required field")
        end
      end

      response "429", "too many signup attempts from this address" do
        let(:signup) { { token: "piotrs-token", password: "tea before the long walk", currency: "PLN" } }

        before { create(:invite, token: "piotrs-token") }

        it_behaves_like "an attempt limit",
                        -> { post "/api/signup", params: { token: "guess", password: "x", currency: "PLN" }, as: :json }
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
    it "keeps the invite token out of the log, on lookup and on accept" do
      create(:invite, token: "piotrs-secret-token")
      log = StringIO.new
      Rails.logger.broadcast_to(capture = ActiveSupport::Logger.new(log))

      get "/api/signup", params: { token: "piotrs-secret-token" }
      post "/api/signup", params: { token: "piotrs-secret-token", password: "tea before the long walk", currency: "PLN" }, as: :json
      Rails.logger.stop_broadcasting_to(capture)

      expect(log.string).to include('Started GET "/api/signup?token=[FILTERED]"', '"token" => "[FILTERED]", "password"')
        .and not_include("piotrs-secret-token")
    end

    it "refuses an expired invite, naming the state" do
      create(:invite, :expired, token: "piotrs-token")

      post "/api/signup", params: { token: "piotrs-token", password: "tea before the long walk", currency: "PLN" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "title" => "This invite has expired")
    end

    it "refuses a used invite, naming the state" do
      create(:invite, :accepted, token: "piotrs-token")

      post "/api/signup", params: { token: "piotrs-token", password: "tea before the long walk", currency: "PLN" }, as: :json

      expect(response.parsed_body).to include("status" => 422, "title" => "This invite was already used")
    end

    it "shows an expired invite as expired" do
      create(:invite, :expired, token: "piotrs-token")

      get "/api/signup", params: { token: "piotrs-token" }

      expect(response.parsed_body["status"]).to eq("expired")
    end

    it "shows a used invite as accepted, even past its expiry" do
      create(:invite, :accepted, token: "piotrs-token", expires_at: 1.day.ago)

      get "/api/signup", params: { token: "piotrs-token" }

      expect(response.parsed_body["status"]).to eq("accepted")
    end

    it "lets a link create only one account" do
      create(:invite, email: "piotr@example.com", token: "piotrs-token")
      body = { token: "piotrs-token", password: "tea before the long walk", currency: "PLN" }

      2.times { post "/api/signup", params: body, as: :json }

      expect([ response.status, User.where(email: "piotr@example.com").count ]).to eq([ 422, 1 ])
    end

    it_behaves_like "a password that must be a string",
                    ->(fragment) { post "/api/signup", params: { token: "piotrs-token", currency: "PLN", **fragment }, as: :json } do
      before { create(:invite, token: "piotrs-token") }
    end

    it "keeps the invite pending after a password that isn't a string" do
      create(:invite, token: "piotrs-token")

      post "/api/signup", params: { token: "piotrs-token", password: 123456789012, currency: "PLN" }, as: :json
      get "/api/signup", params: { token: "piotrs-token" }

      expect(response.parsed_body["status"]).to eq("pending")
    end

    it "answers a token that isn't a string as an unknown link on accept" do
      create(:invite, token: "piotrs-token")

      refusals = [ 123456789012, { "x" => "piotrs-token" }, [ "piotrs-token" ] ].map do |token|
        post "/api/signup", params: { token:, password: "tea before the long walk", currency: "PLN" }, as: :json
        [ response.status, response.parsed_body["title"] ]
      end

      expect(refusals.uniq).to eq([ [ 404, "Not found" ] ])
    end

    it "answers a token that isn't a string as an unknown link on lookup" do
      create(:invite, token: "piotrs-token")

      get "/api/signup", params: { token: [ "piotrs-token" ] }

      expect(response.parsed_body).to include("status" => 404, "title" => "Not found")
    end

    it "answers malformed fields with field errors, not a server error" do
      create(:invite, token: "piotrs-token")

      post "/api/signup", params: { token: "piotrs-token", password: "a\u0000b" * 6, currency: { "$ne" => "" } }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("errors" => include("currency")))
    end
  end
end

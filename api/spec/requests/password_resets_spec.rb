# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Password resets", type: :request do
  # The token travels as a query parameter or in the body, never in the path, so the log filter masks it.
  path "/api/password_reset" do
    get "Shows whose password a reset link sets" do
      tags "Password resets"
      operationId "getPasswordReset"
      produces "application/json", "application/problem+json"
      parameter name: :token, in: :query, type: :string, required: true

      response "200", "the email the link resets" do
        schema "$ref" => "#/components/schemas/PasswordReset"
        let(:token) { create(:user, email: "marta@example.com").password_reset_token }

        run_test! do |response|
          expect(response.parsed_body).to eq("email" => "marta@example.com")
        end
      end

      response "404", "an expired, used or unknown link: one dead-link state" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:token) { "garbled-token" }

        run_test!
      end
    end

    # rswag reads params from `let`; a reset token can't be a literal, so the token lets create its user.
    patch "Sets a new password from a reset link, ends the user's sessions, and signs them in here" do
      tags "Password resets"
      operationId "updatePasswordReset"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :password_reset, in: :body, schema: {
        type: :object,
        properties: { token: { type: :string }, password: { type: :string } },
        required: %w[ token password ]
      }

      response "200", "password set and signed in as that user; the session cookie is set" do
        schema "$ref" => "#/components/schemas/Session"
        let(:password_reset) do
          { token: create(:user, email: "marta@example.com").password_reset_token, password: "a long and quiet evening" }
        end

        run_test! do
          get "/api/session"

          expect(response.parsed_body).to eq("email" => "marta@example.com", "admin" => false, "currency" => "PLN")
        end
      end

      response "422", "the new password is invalid; the link still works" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:password_reset) { { token: create(:user).password_reset_token, password: "marta2026" } }

        run_test! do |response|
          expect(response.parsed_body["errors"]).to eq("password" => [ "is too short (minimum is 12 characters)" ])
        end
      end

      response "400", "the password is missing, blank or not a string; the link still works" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:password_reset) { { token: create(:user).password_reset_token, password: "" } }

        run_test!
      end

      response "404", "an expired, used or unknown link: one dead-link state" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:password_reset) { { token: "garbled-token", password: "a long and quiet evening" } }

        run_test!
      end

      response "429", "too many reset attempts from this address" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:password_reset) { { token: "garbled-token", password: "a long and quiet evening" } }

        before do
          10.times { patch "/api/password_reset", params: { token: "guess", password: "x" }, as: :json }
        end

        run_test! do |response|
          expect(response.parsed_body).to include("status" => 429, "title" => "Too many attempts. Try again in a few minutes.")
        end
      end
    end
  end

  # Behaviour beyond the documented responses; each example sets up only its own data.
  describe "details" do
    it "treats a link older than 24 hours as dead" do
      token = create(:user).password_reset_token
      travel 24.hours + 1.second

      get "/api/password_reset", params: { token: }

      expect(response).to have_http_status(:not_found)
    end

    it "still opens a link just inside its 24 hours" do
      token = create(:user).password_reset_token
      travel 24.hours - 1.second

      get "/api/password_reset", params: { token: }

      expect(response).to have_http_status(:ok)
    end

    it "signs in with the new password afterwards, not the old one" do
      marta = create(:user, email: "marta@example.com", password: "correct horse battery")

      patch "/api/password_reset", params: { token: marta.password_reset_token, password: "a long and quiet evening" }, as: :json
      statuses = [ "correct horse battery", "a long and quiet evening" ].map do |password|
        post "/api/session", params: { email: "marta@example.com", password: }, as: :json
        response.status
      end

      expect(statuses).to eq([ 401, 201 ])
    end

    it "opens the link the admin just created" do
      admin = create(:user, :admin, password: "correct horse battery")
      marta = create(:user, email: "marta@example.com")
      sign_in_as admin, password: "correct horse battery"

      post "/api/users/#{marta.id}/reset_links", as: :json
      get "/api/password_reset", params: { token: response.parsed_body["token"] }

      expect(response.parsed_body).to eq("email" => "marta@example.com")
    end

    it "lets a link set the password only once" do
      token = create(:user).password_reset_token

      statuses = [ "a long and quiet evening", "another long quiet evening" ].map do |password|
        patch "/api/password_reset", params: { token:, password: }, as: :json
        response.status
      end

      expect(statuses).to eq([ 200, 404 ])
    end

    it "ends the user's other sessions" do
      marta = create(:user, password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"
      old_session = cookies[:session_id]

      patch "/api/password_reset", params: { token: marta.password_reset_token, password: "a long and quiet evening" }, as: :json
      cookies[:session_id] = old_session
      get "/api/session"

      expect(response).to have_http_status(:unauthorized)
    end

    it "refuses a blank password, keeping the old one, the sessions and the link" do
      marta = create(:user, password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"
      token = marta.password_reset_token

      patch "/api/password_reset", params: { token:, password: "" }, as: :json
      refusal = response.status
      get "/api/session"
      session_status = response.status
      get "/api/password_reset", params: { token: }

      expect([ refusal, session_status, response.status ]).to eq([ 400, 200, 200 ])
    end

    it "refuses a password that isn't a string, keeping the old one and the link" do
      marta = create(:user, email: "marta@example.com", password: "correct horse battery")
      token = marta.password_reset_token

      refusals = [ nil, 123456789012, [ "a long and quiet evening" ], { "x" => "a long and quiet evening" } ].map do |password|
        patch "/api/password_reset", params: { token:, password: }, as: :json
        [ response.status, response.parsed_body["title"] ]
      end
      post "/api/session", params: { email: "marta@example.com", password: "correct horse battery" }, as: :json
      sign_in = response.status
      get "/api/password_reset", params: { token: }

      expect([ refusals.uniq, sign_in, response.status ]).to eq([ [ [ 400, "Send every required field" ] ], 201, 200 ])
    end

    it "keeps the reset token out of the log, on lookup and on update" do
      token = create(:user).password_reset_token
      log = StringIO.new
      Rails.logger.broadcast_to(capture = ActiveSupport::Logger.new(log))

      get "/api/password_reset", params: { token: }
      patch "/api/password_reset", params: { token:, password: "a long and quiet evening" }, as: :json
      Rails.logger.stop_broadcasting_to(capture)

      expect(log.string).to include('Started GET "/api/password_reset?token=[FILTERED]"', '"token" => "[FILTERED]", "password"')
        .and not_include(token)
    end
  end
end

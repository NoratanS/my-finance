# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Password", type: :request do
  path "/api/password" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    patch "Changes the signed-in user's password; ends their other sessions and keeps this one" do
      tags "Password"
      operationId "updatePassword"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :password_change, in: :body, schema: {
        type: :object,
        properties: { current_password: { type: :string }, password: { type: :string } },
        required: %w[ current_password password ]
      }

      response "200", "password changed; this device stays signed in, every other session ends" do
        schema "$ref" => "#/components/schemas/Session"
        let(:password_change) { { current_password: "correct horse battery", password: "a long and quiet evening" } }

        before do
          sign_in_as create(:user, email: "marta@example.com", password: "correct horse battery"), password: "correct horse battery"
        end

        # No block argument: it would shadow `response`, which the follow-up request replaces.
        run_test! do
          changed = response.parsed_body
          get "/api/session"

          expect([ changed, response.status ]).to eq([ { "email" => "marta@example.com", "admin" => false, "currency" => "PLN" }, 200 ])
        end
      end

      response "422", "the current password is wrong; nothing changes" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:password_change) { { current_password: "wrong horse battery", password: "a long and quiet evening" } }

        before do
          sign_in_as create(:user, email: "marta@example.com", password: "correct horse battery"), password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body["errors"]).to eq("current_password" => [ "That isn’t your current password." ])
        end
      end

      response "400", "a field is missing, blank or not a string" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:password_change) { { password: "a long and quiet evening" } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:password_change) { { current_password: "correct horse battery", password: "a long and quiet evening" } }

        run_test!
      end

      response "429", "too many password changes from this address" do
        let(:password_change) { { current_password: "correct horse battery", password: "a long and quiet evening" } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        it_behaves_like "an attempt limit",
                        -> { patch "/api/password", params: { current_password: "guess", password: "a long and quiet evening" }, as: :json }
      end
    end
  end

  # Behaviour beyond the documented responses; each example sets up only its own data.
  describe "details" do
    it "ends the user's other sessions" do
      marta = create(:user, password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"
      other_device = cookies[:session_id]
      sign_in_as marta, password: "correct horse battery"

      patch "/api/password", params: { current_password: "correct horse battery", password: "a long and quiet evening" }, as: :json
      cookies[:session_id] = other_device
      get "/api/session"

      expect(response).to have_http_status(:unauthorized)
    end

    it "refuses a new password that's too short" do
      marta = create(:user, password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"

      patch "/api/password", params: { current_password: "correct horse battery", password: "marta2026" }, as: :json

      expect([ response.status, response.parsed_body["errors"] ])
        .to eq([ 422, { "password" => [ "is too short (minimum is 12 characters)" ] } ])
    end

    it "treats a NUL in the current password as a wrong password, not a server error" do
      marta = create(:user, password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"

      patch "/api/password", params: { current_password: "correct horse\u0000battery", password: "a long and quiet evening" }, as: :json

      expect([ response.status, response.parsed_body["errors"] ])
        .to eq([ 422, { "current_password" => [ "That isn’t your current password." ] } ])
    end

    it "keeps the old password and the other sessions after a wrong current password" do
      marta = create(:user, email: "marta@example.com", password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"
      other_device = cookies[:session_id]
      sign_in_as marta, password: "correct horse battery"

      patch "/api/password", params: { current_password: "wrong horse battery", password: "a long and quiet evening" }, as: :json
      cookies[:session_id] = other_device
      get "/api/session"
      session_status = response.status
      post "/api/session", params: { email: "marta@example.com", password: "correct horse battery" }, as: :json

      expect([ session_status, response.status ]).to eq([ 200, 201 ])
    end

    it "keeps the password when the current one is missing" do
      marta = create(:user, email: "marta@example.com", password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"

      patch "/api/password", params: { password: "a long and quiet evening" }, as: :json
      refusal = response.status
      post "/api/session", params: { email: "marta@example.com", password: "correct horse battery" }, as: :json

      expect([ refusal, response.status ]).to eq([ 400, 201 ])
    end

    it_behaves_like "a password that must be a string",
                    ->(fragment) { patch "/api/password", params: { current_password: "correct horse battery", **fragment }, as: :json } do
      before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }
    end

    it_behaves_like "a password that must be a string", lambda { |fragment|
      patch "/api/password", params: { password: "a long and quiet evening", **fragment.transform_keys { :current_password } }, as: :json
    } do
      before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }
    end

    it "keeps the old password and the other sessions after a password that isn't a string" do
      marta = create(:user, email: "marta@example.com", password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"
      other_device = cookies[:session_id]
      sign_in_as marta, password: "correct horse battery"

      patch "/api/password", params: { current_password: "correct horse battery", password: 123456789012 }, as: :json
      cookies[:session_id] = other_device
      get "/api/session"
      session_status = response.status
      post "/api/session", params: { email: "marta@example.com", password: "correct horse battery" }, as: :json

      expect([ session_status, response.status ]).to eq([ 200, 201 ])
    end

    it "signs in with the new password afterwards, not the old one" do
      marta = create(:user, email: "marta@example.com", password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"

      patch "/api/password", params: { current_password: "correct horse battery", password: "a long and quiet evening" }, as: :json
      statuses = [ "correct horse battery", "a long and quiet evening" ].map do |password|
        post "/api/session", params: { email: "marta@example.com", password: }, as: :json
        response.status
      end

      expect(statuses).to eq([ 401, 201 ])
    end

    it "leaves another user's password and sessions alone" do
      ola = create(:user, email: "ola@example.com", password: "ola's own long password")
      sign_in_as ola, password: "ola's own long password"
      olas_session = cookies[:session_id]
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      patch "/api/password", params: { current_password: "correct horse battery", password: "a long and quiet evening" }, as: :json
      cookies[:session_id] = olas_session
      get "/api/session"
      session_status = response.status
      post "/api/session", params: { email: "ola@example.com", password: "ola's own long password" }, as: :json

      expect([ session_status, response.status ]).to eq([ 200, 201 ])
    end
  end
end

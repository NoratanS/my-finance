# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Session", type: :request do
  path "/api/session" do
    get "Returns the signed-in user" do
      tags "Session"
      operationId "getSession"
      produces "application/json", "application/problem+json"

      response "200", "the signed-in user" do
        schema "$ref" => "#/components/schemas/Session"

        before do
          create(:user, email: "marta@example.com", password: "correct horse battery", currency: "EUR")
          post "/api/session", params: { email: "marta@example.com", password: "correct horse battery" }
        end

        run_test! do |response|
          expect(response.parsed_body).to eq("email" => "marta@example.com", "admin" => false, "currency" => "EUR")
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"

        run_test! do |response|
          expect(response).to have_attributes(
            media_type: "application/problem+json",
            parsed_body: include("status" => 401, "title" => "Sign in to continue")
          )
        end
      end
    end

    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Signs in" do
      tags "Session"
      operationId "createSession"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :credentials, in: :body, schema: {
        type: :object,
        properties: { email: { type: :string }, password: { type: :string } },
        required: %w[ email password ]
      }

      response "201", "signed in; the session cookie is set" do
        schema "$ref" => "#/components/schemas/Session"
        let(:credentials) { { email: "Marta@Example.com ", password: "correct horse battery" } }

        before { create(:user, :admin, email: "marta@example.com", password: "correct horse battery") }

        run_test! do |response|
          expect(response.parsed_body).to eq("email" => "marta@example.com", "admin" => true, "currency" => "PLN")
        end

        it "sets an httponly SameSite=Lax cookie" do
          create(:user, email: "jan@example.com", password: "correct horse battery")

          post "/api/session", params: { email: "jan@example.com", password: "correct horse battery" }

          expect(response.headers["set-cookie"]).to match(/session_id=.*; httponly; samesite=lax/i)
        end
      end

      response "401", "wrong email or password, with one message for both" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:credentials) { { email: "marta@example.com", password: "wrong password!" } }

        before { create(:user, email: "marta@example.com", password: "correct horse battery") }

        run_test! do |response|
          expect(response.parsed_body).to eq(
            "type" => "about:blank", "title" => "That email and password don’t match", "status" => 401
          )
        end

        it "answers an unknown email exactly like a wrong password" do
          create(:user, email: "jan@example.com", password: "correct horse battery")

          post "/api/session", params: { email: "jan@example.com", password: "wrong password!" }
          wrong_password = response.body
          post "/api/session", params: { email: "nobody@example.com", password: "correct horse battery" }

          expect(response.body).to eq(wrong_password)
        end

        it "answers a missing or malformed field with the same message" do
          create(:user, email: "jan@example.com", password: "correct horse battery")

          bodies = [ {}, { password: "correct horse battery" }, { email: { "$ne" => "" }, password: "x" } ].map do |params|
            post "/api/session", params:, as: :json
            [ response.status, response.parsed_body["title"] ]
          end

          expect(bodies.uniq).to eq([ [ 401, "That email and password don’t match" ] ])
        end
      end

      response "429", "too many sign-in attempts from this address" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:credentials) { { email: "marta@example.com", password: "correct horse battery" } }

        before do
          create(:user, email: "marta@example.com", password: "correct horse battery")
          10.times { post "/api/session", params: { email: "marta@example.com", password: "wrong password!" } }
        end

        run_test! do |response|
          expect(response.parsed_body).to include("status" => 429, "title" => "Too many attempts. Try again in a few minutes.")
        end
      end
    end

    delete "Signs out" do
      tags "Session"
      operationId "deleteSession"
      produces "application/problem+json"

      response "204", "signed out; the session no longer works" do
        before do
          create(:user, email: "marta@example.com", password: "correct horse battery")
          post "/api/session", params: { email: "marta@example.com", password: "correct horse battery" }
        end

        run_test! do
          get "/api/session"

          expect(response).to have_http_status(:unauthorized)
        end

        it "refuses the old cookie afterwards" do
          create(:user, email: "jan@example.com", password: "correct horse battery")
          post "/api/session", params: { email: "jan@example.com", password: "correct horse battery" }
          old_cookie = cookies[:session_id]

          delete "/api/session"
          cookies[:session_id] = old_cookie
          get "/api/session"

          expect(response).to have_http_status(:unauthorized)
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"

        run_test!
      end
    end
  end
end

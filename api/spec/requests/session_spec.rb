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
          post "/api/session", params: { email: "marta@example.com", password: "correct horse battery" }, as: :json
        end

        run_test! do |response|
          expect(response.parsed_body).to eq("email" => "marta@example.com", "admin" => false, "currency" => "EUR", "currency_locked" => false)
        end
      end

      response "200", "the signed-in user, whose currency is locked once they have a transaction" do
        schema "$ref" => "#/components/schemas/Session"

        before do
          marta = create(:user, password: "correct horse battery")
          create(:transaction, user: marta)
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to include("currency_locked" => true)
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
          expect(response.parsed_body).to eq("email" => "marta@example.com", "admin" => true, "currency" => "PLN", "currency_locked" => false)
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
      end

      response "400", "the password is missing, blank or not a string" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:credentials) { { email: "marta@example.com", password: 123456789012 } }

        before { create(:user, email: "marta@example.com", password: "123456789012") }

        run_test! do |response|
          expect(response.parsed_body).to include("status" => 400, "title" => "Send every required field")
        end
      end

      response "429", "too many sign-in attempts from this address" do
        let(:credentials) { { email: "marta@example.com", password: "correct horse battery" } }

        before { create(:user, email: "marta@example.com", password: "correct horse battery") }

        it_behaves_like "an attempt limit",
                        -> { post "/api/session", params: { email: "marta@example.com", password: "wrong password!" }, as: :json }
      end
    end

    delete "Signs out" do
      tags "Session"
      operationId "deleteSession"
      produces "application/problem+json"

      response "204", "signed out; the session no longer works" do
        before do
          create(:user, email: "marta@example.com", password: "correct horse battery")
          post "/api/session", params: { email: "marta@example.com", password: "correct horse battery" }, as: :json
        end

        run_test! do
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

  # Behaviour beyond the documented responses; each example sets up only its own data.
  describe "details" do
    it "refuses a cross-site form post, so another site can't sign you in (login CSRF)" do
      create(:user, email: "jan@example.com", password: "correct horse battery")

      post "/api/session", params: { email: "jan@example.com", password: "correct horse battery" },
                           headers: { "Origin" => "https://evil.example" }

      expect(response).to have_attributes(
        status: 415, media_type: "application/problem+json", headers: not_include("set-cookie")
      )
    end

    it "sets an httponly SameSite=Lax cookie on sign in" do
      create(:user, email: "jan@example.com", password: "correct horse battery")

      post "/api/session", params: { email: "jan@example.com", password: "correct horse battery" }, as: :json

      expect(response.headers["set-cookie"]).to match(/session_id=.*; httponly; samesite=lax/i)
    end

    it "answers an unknown email exactly like a wrong password" do
      create(:user, email: "jan@example.com", password: "correct horse battery")

      post "/api/session", params: { email: "jan@example.com", password: "wrong password!" }, as: :json
      wrong_password = response.body
      post "/api/session", params: { email: "nobody@example.com", password: "correct horse battery" }, as: :json

      expect(response.body).to eq(wrong_password)
    end

    it "answers a missing or malformed email like a wrong password" do
      create(:user, email: "jan@example.com", password: "correct horse battery")

      bodies = [ { password: "correct horse battery" }, { email: { "$ne" => "" }, password: "x" } ].map do |params|
        post "/api/session", params:, as: :json
        [ response.status, response.parsed_body["title"] ]
      end

      expect(bodies.uniq).to eq([ [ 401, "That email and password don’t match" ] ])
    end

    it_behaves_like "a password that must be a string",
                    ->(fragment) { post "/api/session", params: { email: "jan@example.com", **fragment }, as: :json } do
      before { create(:user, email: "jan@example.com", password: "correct horse battery") }
    end

    it "signs in a user whose password is only spaces, which signup allows" do
      create(:invite, email: "jan@example.com").accept!(password: " " * 14, currency: "PLN")

      post "/api/session", params: { email: "jan@example.com", password: " " * 14 }, as: :json

      expect(response).to have_http_status(:created)
    end

    it "answers a NUL in the email or password with the same message" do
      create(:user, email: "jan@example.com", password: "correct horse battery")

      titles = [ { email: "jan\u0000@example.com", password: "x" }, { email: "jan@example.com", password: "a\u0000b" } ]
        .map { |params| post("/api/session", params:, as: :json).then { response.parsed_body["title"] } }

      expect(titles.uniq).to eq([ "That email and password don’t match" ])
    end

    it "answers a malformed JSON body with a problem+json 400" do
      post "/api/session", params: "{not json", headers: { "Content-Type" => "application/json" }

      expect(response).to have_attributes(
        status: 400, media_type: "application/problem+json", parsed_body: include("status" => 400)
      )
    end

    it "refuses the old cookie after sign out" do
      create(:user, email: "jan@example.com", password: "correct horse battery")
      post "/api/session", params: { email: "jan@example.com", password: "correct horse battery" }, as: :json
      old_cookie = cookies[:session_id]

      delete "/api/session"
      cookies[:session_id] = old_cookie
      get "/api/session"

      expect(response).to have_http_status(:unauthorized)
    end
  end
end

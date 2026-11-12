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
  end
end

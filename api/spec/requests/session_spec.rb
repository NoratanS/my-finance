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
  end
end

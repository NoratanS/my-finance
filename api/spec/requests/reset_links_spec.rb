# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Reset links", type: :request do
  path "/api/users/{user_id}/reset_links" do
    parameter name: :user_id, in: :path, type: :integer

    post "Creates a password reset link for a user (admin only); the token is returned once" do
      tags "Users"
      operationId "createResetLink"
      consumes "application/json"
      produces "application/json", "application/problem+json"

      response "201", "link created; build it from the token" do
        schema "$ref" => "#/components/schemas/ResetLink"
        let(:user_id) { 4242 }

        before do
          travel_to Time.utc(2026, 11, 10, 14, 30)
          create(:user, id: 4242, email: "marta@example.com")
          sign_in_as create(:user, :admin, password: "correct horse battery"), password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to include(
            "email" => "marta@example.com", "expires_at" => "2026-11-11T14:30:00.000Z", "token" => be_present
          )
        end
      end

      response "404", "no such user, or not the admin" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:user_id) { 4242 }

        before do
          create(:user, id: 4242)
          sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"
        end

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:user_id) { 4242 }

        run_test!
      end
    end
  end

  describe "details" do
    it "answers an unknown user with a 404" do
      sign_in_as create(:user, :admin, password: "correct horse battery"), password: "correct horse battery"

      post "/api/users/4242/reset_links", as: :json

      expect(response).to have_http_status(:not_found)
    end
  end
end

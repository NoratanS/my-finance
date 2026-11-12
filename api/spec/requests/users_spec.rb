# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Users", type: :request do
  path "/api/users" do
    get "Lists every user (admin only)" do
      tags "Users"
      operationId "listUsers"
      produces "application/json", "application/problem+json"

      response "200", "every user, longest-standing first" do
        schema type: :array, items: { "$ref" => "#/components/schemas/User" }

        before do
          travel_to Time.zone.local(2026, 11, 2, 12)
          admin = create(:user, :admin, email: "chris@example.com", password: "correct horse battery")
          travel_to Time.zone.local(2026, 11, 5, 12)
          create(:user, email: "tomek@example.com")
          travel_to Time.zone.local(2026, 11, 3, 12)
          create(:user, email: "marta@example.com")
          sign_in_as admin, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to match([
            include("email" => "chris@example.com", "joined_at" => "2026-11-02T12:00:00.000Z"),
            include("email" => "marta@example.com", "joined_at" => "2026-11-03T12:00:00.000Z"),
            include("email" => "tomek@example.com", "joined_at" => "2026-11-05T12:00:00.000Z")
          ])
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"

        run_test!
      end

      response "404", "not the admin" do
        schema "$ref" => "#/components/schemas/Problem"

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
      end
    end
  end
end

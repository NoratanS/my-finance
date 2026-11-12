# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Invites", type: :request do
  path "/api/invites" do
    get "Lists pending invites (admin only)" do
      tags "Invites"
      operationId "listInvites"
      produces "application/json", "application/problem+json"

      response "200", "unaccepted, unexpired invites, soonest expiry first" do
        schema type: :array, items: { "$ref" => "#/components/schemas/Invite" }

        before do
          travel_to Time.zone.local(2026, 11, 10, 12)
          admin = create(:user, :admin)
          create(:invite, email: "kasia@example.com", expires_at: 7.days.from_now, created_by: admin)
          create(:invite, email: "piotr@example.com", expires_at: 5.days.from_now, created_by: admin)
          create(:invite, :expired, email: "old@example.com", created_by: admin)
          create(:invite, :accepted, email: "ania@example.com", created_by: admin)
          sign_in_as admin
        end

        run_test! do |response|
          expect(response.parsed_body).to match([
            include("email" => "piotr@example.com", "expires_at" => "2026-11-15T12:00:00.000Z"),
            include("email" => "kasia@example.com", "expires_at" => "2026-11-17T12:00:00.000Z")
          ])
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"

        run_test!
      end

      response "404", "not the admin" do
        schema "$ref" => "#/components/schemas/Problem"

        before do
          create(:invite)
          sign_in_as create(:user)
        end

        run_test!
      end
    end

    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Invites an email (admin only); the token is returned once" do
      tags "Invites"
      operationId "createInvite"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :invite, in: :body, schema: {
        type: :object, properties: { email: { type: :string } }, required: %w[ email ]
      }

      response "201", "invite created; build the link from its token" do
        schema "$ref" => "#/components/schemas/CreatedInvite"
        let(:invite) { { email: "Piotr@Example.com" } }

        before do
          travel_to Time.zone.local(2026, 11, 10, 12)
          sign_in_as create(:user, :admin)
        end

        run_test! do |response|
          expect(response.parsed_body).to include(
            "email" => "piotr@example.com", "expires_at" => "2026-11-17T12:00:00.000Z", "token" => match(/\A[\w-]{43}\z/)
          )
        end
      end

      response "422", "the email already has an account" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:invite) { { email: "marta@example.com" } }

        before do
          create(:user, email: "marta@example.com")
          sign_in_as create(:user, :admin)
        end

        run_test! do |response|
          expect(response).to have_attributes(
            media_type: "application/problem+json",
            parsed_body: include("status" => 422, "errors" => { "email" => [ "marta@example.com already has an account." ] })
          )
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:invite) { { email: "piotr@example.com" } }

        run_test!
      end

      response "404", "not the admin" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:invite) { { email: "piotr@example.com" } }

        before { sign_in_as create(:user) }

        run_test!
      end
    end
  end

  path "/api/invites/{id}" do
    parameter name: :id, in: :path, type: :integer

    delete "Revokes a pending invite (admin only)" do
      tags "Invites"
      operationId "deleteInvite"
      produces "application/problem+json"

      response "204", "revoked; it leaves the pending list" do
        let(:id) { 4242 }

        before do
          admin = create(:user, :admin)
          create(:invite, id: 4242, created_by: admin)
          sign_in_as admin
        end

        run_test! do
          get "/api/invites"

          expect(response.parsed_body).to be_empty
        end
      end

      response "404", "no such invite, or not the admin" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }

        before do
          create(:invite, id: 4242)
          sign_in_as create(:user)
        end

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }

        run_test!
      end
    end
  end

  # Behaviour beyond the documented responses; each example sets up only its own data.
  describe "details" do
    it "answers an unknown invite with a 404" do
      sign_in_as create(:user, :admin)

      delete "/api/invites/4242"

      expect(response).to have_http_status(:not_found)
    end

    it "replaces a pending invite when the same email is invited again" do
      admin = create(:user, :admin)
      create(:invite, email: "piotr@example.com", created_by: admin)
      sign_in_as admin

      post "/api/invites", params: { email: "piotr@example.com" }, as: :json
      new_id = response.parsed_body["id"]
      get "/api/invites"

      expect(response.parsed_body.pluck("id")).to eq([ new_id ])
    end

    it "answers a malformed email with a field error, not a server error" do
      sign_in_as create(:user, :admin)

      post "/api/invites", params: { email: { "$ne" => "" } }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("errors" => include("email")))
    end
  end
end

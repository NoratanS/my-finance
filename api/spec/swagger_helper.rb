# frozen_string_literal: true

require "rails_helper"

RSpec.configure do |config|
  config.openapi_root = Rails.root.join("swagger").to_s

  # Paths carry the /api prefix, so the server is the app's own origin.
  config.openapi_specs = {
    "v1/openapi.yaml" => {
      openapi: "3.0.3",
      info: { title: "my-finance API", version: "v1" },
      paths: {},
      servers: [ { url: "/" } ],
      components: {
        schemas: {
          Session: {
            type: :object,
            properties: {
              email: { type: :string },
              admin: { type: :boolean },
              currency: { "$ref" => "#/components/schemas/Currency" }
            },
            required: %w[ email admin currency ],
            additionalProperties: false
          },
          Currency: { type: :string, enum: User::CURRENCIES },
          Kind: { type: :string, enum: Transaction.kinds.keys },
          # Amount in minor units, always positive; kind carries the sign (ADR 0006).
          Transaction: {
            type: :object,
            properties: {
              id: { type: :integer },
              amount: { type: :integer },
              kind: { "$ref" => "#/components/schemas/Kind" },
              date: { type: :string, format: :date },
              description: { type: :string }
            },
            required: %w[ id amount kind date description ],
            additionalProperties: false
          },
          Invite: {
            type: :object,
            properties: {
              id: { type: :integer },
              email: { type: :string },
              expires_at: { type: :string, format: "date-time" }
            },
            required: %w[ id email expires_at ],
            additionalProperties: false
          },
          # Only the create response carries the token; the API never shows it again.
          CreatedInvite: {
            type: :object,
            properties: {
              id: { type: :integer },
              email: { type: :string },
              expires_at: { type: :string, format: "date-time" },
              token: { type: :string }
            },
            required: %w[ id email expires_at token ],
            additionalProperties: false
          },
          Signup: {
            type: :object,
            properties: {
              email: { type: :string },
              status: { type: :string, enum: %w[ pending expired accepted ] },
              expires_at: { type: :string, format: "date-time" }
            },
            required: %w[ email status expires_at ],
            additionalProperties: false
          },
          User: {
            type: :object,
            properties: {
              id: { type: :integer },
              email: { type: :string },
              joined_at: { type: :string, format: "date-time" }
            },
            required: %w[ id email joined_at ],
            additionalProperties: false
          },
          # Only the create response carries the token; the API never shows it again.
          ResetLink: {
            type: :object,
            properties: {
              email: { type: :string },
              token: { type: :string },
              expires_at: { type: :string, format: "date-time" }
            },
            required: %w[ email token expires_at ],
            additionalProperties: false
          },
          PasswordReset: {
            type: :object,
            properties: { email: { type: :string } },
            required: %w[ email ],
            additionalProperties: false
          },
          # RFC 9457 problem details (ADR 0011).
          Problem: {
            type: :object,
            properties: {
              type: { type: :string },
              title: { type: :string },
              status: { type: :integer },
              errors: { type: :object, additionalProperties: { type: :array, items: { type: :string } } }
            },
            required: %w[ type title status ]
          }
        }
      }
    }
  }

  config.openapi_format = :yaml
end

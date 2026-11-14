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
              currency: { "$ref" => "#/components/schemas/Currency" },
              # True once the ledger has a transaction; the currency can't change then.
              currency_locked: { type: :boolean }
            },
            required: %w[ email admin currency currency_locked ],
            additionalProperties: false
          },
          Currency: { type: :string, enum: User::CURRENCIES },
          Kind: { type: :string, enum: Transaction.kinds.keys },
          # A list's period: one month as YYYY-MM, or all.
          Period: { type: :string, pattern: "^(\\d{4}-(0[1-9]|1[0-2])|all)$" },
          # Amount in minor units, always positive; kind carries the sign (ADR 0006).
          Transaction: {
            type: :object,
            properties: {
              id: { type: :integer },
              amount: { type: :integer },
              kind: { "$ref" => "#/components/schemas/Kind" },
              date: { type: :string, format: :date },
              description: { type: :string },
              # Unordered; the web shows them A–Z in Polish order.
              tags: { type: :array, items: { "$ref" => "#/components/schemas/TagChip" } }
            },
            required: %w[ id amount kind date description tags ],
            additionalProperties: false
          },
          # What create and update take: every field, so an edit sends the whole transaction.
          TransactionInput: {
            type: :object,
            properties: {
              amount: { type: :integer, description: "Minor units (grosze, cents), always positive" },
              kind: { "$ref" => "#/components/schemas/Kind" },
              date: { type: :string, format: :date },
              description: { type: :string },
              # The whole set, at most 5 of the user's tags; absent or null is none.
              tag_ids: { type: :array, items: { type: :integer }, nullable: true }
            },
            required: %w[ amount kind date ]
          },
          TransactionPage: {
            type: :object,
            properties: {
              data: { type: :array, items: { "$ref" => "#/components/schemas/Transaction" } },
              meta: {
                type: :object,
                properties: {
                  page: { type: :integer },
                  total_pages: { type: :integer },
                  total_count: { type: :integer },
                  # The period listed, so a default request learns which month "this month" is.
                  period: { "$ref" => "#/components/schemas/Period" },
                  # Over every filtered row, not just this page; minor units, net signed.
                  totals: {
                    type: :object,
                    properties: { expense: { type: :integer }, income: { type: :integer }, net: { type: :integer } },
                    required: %w[ expense income net ],
                    additionalProperties: false
                  },
                  # Every untagged transaction in the ledger, whatever the filters.
                  untagged_count: { type: :integer }
                },
                required: %w[ page total_pages total_count period totals untagged_count ],
                additionalProperties: false
              }
            },
            required: %w[ data meta ],
            additionalProperties: false
          },
          TagColour: { type: :string, enum: Tag::COLOURS },
          # Shown as first typed; unique per user ignoring case and surrounding spaces.
          Tag: {
            type: :object,
            properties: {
              id: { type: :integer },
              name: { type: :string },
              colour: { allOf: [ { "$ref" => "#/components/schemas/TagColour" } ], nullable: true },
              # When it was last put on a transaction; null if never.
              last_used_at: { type: :string, format: "date-time", nullable: true },
              # Over the asked tag period, in minor units; a transaction carrying several tags counts in each.
              expense: { type: :integer },
              income: { type: :integer },
              transaction_count: { type: :integer }
            },
            required: %w[ id name colour last_used_at expense income transaction_count ],
            additionalProperties: false
          },
          # Only what a chip draws, so a transaction list doesn't load each tag's usage.
          TagChip: {
            type: :object,
            properties: {
              id: { type: :integer },
              name: { type: :string },
              colour: { allOf: [ { "$ref" => "#/components/schemas/TagColour" } ], nullable: true }
            },
            required: %w[ id name colour ],
            additionalProperties: false
          },
          TagInput: {
            type: :object,
            properties: {
              name: { type: :string },
              colour: { allOf: [ { "$ref" => "#/components/schemas/TagColour" } ], nullable: true }
            },
            required: %w[ name ],
            additionalProperties: false
          },
          # Shown as first typed; unique per user ignoring case and surrounding spaces, like a tag's.
          TagGroup: {
            type: :object,
            properties: { id: { type: :integer }, name: { type: :string } },
            required: %w[ id name ],
            additionalProperties: false
          },
          TagGroupInput: {
            type: :object,
            properties: { name: { type: :string } },
            required: %w[ name ],
            additionalProperties: false
          },
          # The Tags page's span: this month, or the last 3 or 12 calendar months, this one included.
          TagPeriod: { type: :string, enum: TagTotals::PERIODS },
          TagList: {
            type: :object,
            properties: {
              data: { type: :array, items: { "$ref" => "#/components/schemas/Tag" } },
              meta: {
                type: :object,
                # The period totalled, so a default request learns it too.
                properties: {
                  period: { "$ref" => "#/components/schemas/TagPeriod" },
                  # Every untagged transaction in the ledger, over all time.
                  untagged_count: { type: :integer }
                },
                required: %w[ period untagged_count ],
                additionalProperties: false
              }
            },
            required: %w[ data meta ],
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
              errors: { type: :object, additionalProperties: { type: :array, items: { type: :string } } },
              # type tag-name-taken or tag-group-name-taken: the tag or group that already has the name.
              existing_id: { type: :integer }
            },
            required: %w[ type title status ]
          }
        }
      }
    }
  }

  config.openapi_format = :yaml
end

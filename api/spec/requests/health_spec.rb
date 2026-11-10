# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Health", type: :request do
  path "/api/health" do
    get "Checks that the API reaches the database" do
      tags "Health"
      operationId "getHealth"
      produces "application/json"

      response "200", "the API and its database are up" do
        schema type: :object,
               properties: { status: { type: :string, enum: [ "ok" ] } },
               required: [ "status" ],
               additionalProperties: false

        run_test! do |response|
          expect(response.parsed_body).to eq("status" => "ok")
        end
      end
    end
  end
end

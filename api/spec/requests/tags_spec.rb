# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Tags", type: :request do
  path "/api/tags" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Creates a tag in the signed-in user's set" do
      tags "Tags"
      operationId "createTag"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :tag, in: :body, schema: { "$ref" => "#/components/schemas/TagInput" }

      response "201", "created, the name trimmed and kept as typed" do
        schema "$ref" => "#/components/schemas/Tag"
        let(:tag) { { name: "  Eating Out ", colour: nil } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test! do |response|
          expect(response.parsed_body).to match("id" => be_a(Integer), "name" => "Eating Out", "colour" => nil)
        end
      end
    end
  end
end

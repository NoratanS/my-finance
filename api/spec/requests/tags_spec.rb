# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Tags", type: :request do
  path "/api/tags" do
    get "Lists the signed-in user's tags A–Z, ignoring case" do
      tags "Tags"
      operationId "listTags"
      produces "application/json", "application/problem+json"

      response "200", "only my tags, A–Z ignoring case" do
        schema "$ref" => "#/components/schemas/TagList"

        before do
          marta = create(:user, password: "correct horse battery")
          [ "cherry", "Banana", "apple" ].each { create(:tag, user: marta, name: it) }
          create(:tag, name: "Aardvark")
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body["data"].pluck("name")).to eq([ "apple", "Banana", "cherry" ])
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"

        run_test!
      end
    end

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

# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Tag groups", type: :request do
  path "/api/tag_groups" do
    # rswag reads request bodies from `let`; each holds only the literal it sends.
    post "Creates an empty tag group in the signed-in user's set" do
      tags "Tag groups"
      operationId "createTagGroup"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :group, in: :body, schema: { "$ref" => "#/components/schemas/TagGroupInput" }

      response "201", "created, the name trimmed and kept as typed" do
        schema "$ref" => "#/components/schemas/TagGroup"
        let(:group) { { name: "  Shops " } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test! do |response|
          expect(response.parsed_body).to match("id" => be_a(Integer), "name" => "Shops")
        end
      end

      response "422", "the name is taken: case and surrounding spaces don't make a new group" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:group) { { name: " shops " } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:tag_group, id: 4242, user: marta, name: "Shops")
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response).to have_attributes(
            media_type: "application/problem+json",
            parsed_body: include(
              "type" => "tag-group-name-taken", "title" => "You already have a tag group with this name", "status" => 422,
              "existing_id" => 4242, "errors" => { "name" => [ "A group named “Shops” already exists. Pick another name." ] }
            )
          )
        end
      end

      response "400", "the name is missing or not a string" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:group) { { name: 12 } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:group) { { name: "Shops" } }

        run_test!
      end
    end
  end

  describe "creating a group" do
    it "refuses a name that is blank once trimmed, longer than 40 or holds a NUL" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      refusals = [ "    ", "x" * 41, "a\u0000b" ].map do |name|
        post("/api/tag_groups", params: { name: }, as: :json) && [ response.status, response.parsed_body["errors"].keys ]
      end

      expect(refusals).to eq([ [ 422, [ "name" ] ], [ 422, [ "name" ] ], [ 422, [ "name" ] ] ])
    end

    it "refuses a name that is missing or not a string" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      statuses = [ {}, { name: "" }, { name: 12 }, { name: [ "Shops" ] } ]
        .map { post("/api/tag_groups", params: it, as: :json) && response.status }

      expect(statuses).to eq([ 400, 400, 400, 400 ])
    end

    it "lets another user's group name be mine too" do
      create(:tag_group, name: "Shops")
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      post "/api/tag_groups", params: { name: "shops" }, as: :json

      expect(response).to have_attributes(status: 201, parsed_body: include("name" => "shops"))
    end

    it "answers name taken when another request adds the name between the check and the insert" do
      marta = create(:user, password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"
      # The first lookup misses the other request's row, as if it was inserted just after.
      winner_id = nil
      allow(TagGroup).to receive(:find_by).and_wrap_original do |original, *args|
        next original.call(*args) if winner_id

        winner_id = TagGroup.insert_all([ { user_id: marta.id, name: "Shops", normalized_name: "shops" } ], returning: :id).first["id"] # rubocop:disable Rails/SkipsModelValidations -- the other request's row, straight to the table
        nil
      end

      post "/api/tag_groups", params: { name: "SHOPS " }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("type" => "tag-group-name-taken", "existing_id" => winner_id))
    end
  end
end

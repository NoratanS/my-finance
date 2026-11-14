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

  path "/api/tag_groups/{id}" do
    parameter name: :id, in: :path, schema: { type: :integer }

    patch "Renames one of the signed-in user's tag groups" do
      tags "Tag groups"
      operationId "renameTagGroup"
      consumes "application/json"
      produces "application/json", "application/problem+json"
      parameter name: :group, in: :body, schema: { "$ref" => "#/components/schemas/TagGroupInput" }

      response "200", "renamed, the name trimmed and kept as typed" do
        schema "$ref" => "#/components/schemas/TagGroup"
        let(:id) { 4242 }
        let(:group) { { name: " Places " } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:tag_group, id: 4242, user: marta, name: "Shops")
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to eq("id" => 4242, "name" => "Places")
        end
      end

      response "422", "the name is another group's, ignoring case and surrounding spaces: the same error as on create" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }
        let(:group) { { name: "SHOPS  " } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:tag_group, id: 4242, user: marta, name: "Places")
          create(:tag_group, id: 4343, user: marta, name: "Shops")
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response.parsed_body).to include(
            "type" => "tag-group-name-taken", "existing_id" => 4343,
            "errors" => { "name" => [ "A group named “Shops” already exists. Pick another name." ] }
          )
        end
      end

      response "400", "the name is missing or not a string" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }
        let(:group) { { name: nil } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:tag_group, id: 4242, user: marta)
          sign_in_as marta, password: "correct horse battery"
        end

        run_test!
      end

      response "404", "another user's group" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }
        let(:group) { { name: "Mine now" } }

        before do
          create(:tag_group, id: 4242, name: "Shops")
          sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"
        end

        run_test! do
          expect(TagGroup.find(4242).name).to eq("Shops")
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }
        let(:group) { { name: "Places" } }

        run_test!
      end
    end

    delete "Deletes one of the signed-in user's tag groups; its tags move to No group" do
      tags "Tag groups"
      operationId "deleteTagGroup"
      produces "application/problem+json"

      response "204", "deleted, its tags kept in no group" do
        let(:id) { 4242 }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:tag, id: 77, user: marta, tag_group: create(:tag_group, id: 4242, user: marta))
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do
          expect([ TagGroup.exists?(4242), Tag.find(77).tag_group_id ]).to eq([ false, nil ])
        end
      end

      response "404", "another user's group" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }

        before do
          create(:tag_group, id: 4242)
          sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"
        end

        run_test! do
          expect(TagGroup.exists?(4242)).to be(true)
        end
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:id) { 4242 }

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

  describe "renaming a group" do
    it "keeps its own name in another case or with spaces, so Shops → SHOPS is a rename, not a taken name" do
      marta = create(:user, password: "correct horse battery")
      shops = create(:tag_group, user: marta, name: "Shops")
      sign_in_as marta, password: "correct horse battery"

      patch "/api/tag_groups/#{shops.id}", params: { name: " SHOPS" }, as: :json

      expect(response).to have_attributes(status: 200, parsed_body: { "id" => shops.id, "name" => "SHOPS" })
    end

    it "refuses a name that is blank once trimmed, longer than 40 or holds a NUL, and keeps the old one" do
      marta = create(:user, password: "correct horse battery")
      shops = create(:tag_group, user: marta, name: "Shops")
      sign_in_as marta, password: "correct horse battery"

      refusals = [ "  \u00a0 ", "x" * 41, "a\u0000b" ].map do |name|
        patch("/api/tag_groups/#{shops.id}", params: { name: }, as: :json) && [ response.status, response.parsed_body["errors"].keys ]
      end

      expect([ refusals, shops.reload.name ]).to eq([ [ [ 422, [ "name" ] ], [ 422, [ "name" ] ], [ 422, [ "name" ] ] ], "Shops" ])
    end

    it "answers name taken when another request takes the name between the check and the update" do
      places = create(:tag_group, name: "Places", user: create(:user, password: "correct horse battery"))
      sign_in_as places.user, password: "correct horse battery"
      # The first lookup misses the other request's row, as if it was inserted just after.
      winner_id = nil
      allow(TagGroup).to receive(:find_by).and_wrap_original do |original, *args|
        next original.call(*args) if winner_id

        winner_id = TagGroup.insert_all([ { user_id: places.user_id, name: "Shops", normalized_name: "shops" } ], returning: :id).first["id"] # rubocop:disable Rails/SkipsModelValidations -- the other request's row, straight to the table
        nil
      end

      patch "/api/tag_groups/#{places.id}", params: { name: "shops" }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("type" => "tag-group-name-taken", "existing_id" => winner_id))
    end
  end

  describe "deleting a group" do
    it "moves its tags to no group and leaves their transactions and my other groups alone" do
      marta = create(:user, password: "correct horse battery")
      occasions, people = [ "Occasions", "People" ].map { create(:tag_group, user: marta, name: it) }
      party, family = [ [ "Party", occasions ], [ "Family", people ] ].map { |name, group| create(:tag, user: marta, name:, tag_group: group) }
      create(:transaction, user: marta, tags: [ party ])
      sign_in_as marta, password: "correct horse battery"

      delete "/api/tag_groups/#{occasions.id}"

      expect([ party.reload.tag_group_id, party.transaction_tags.count, family.reload.tag_group_id ]).to eq([ nil, 1, people.id ])
    end
  end
end

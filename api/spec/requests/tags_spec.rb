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
          expect(response.parsed_body).to match("id" => be_a(Integer), "name" => "Eating Out", "colour" => nil, "last_used_at" => nil)
        end
      end

      response "422", "the name is taken: case and surrounding spaces don't make a new tag" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:tag) { { name: " groceries " } }

        before do
          marta = create(:user, password: "correct horse battery")
          create(:tag, id: 4242, user: marta, name: "Groceries")
          sign_in_as marta, password: "correct horse battery"
        end

        run_test! do |response|
          expect(response).to have_attributes(
            media_type: "application/problem+json",
            parsed_body: include(
              "type" => "tag-name-taken", "status" => 422, "existing_id" => 4242,
              "errors" => { "name" => [ "You already have “Groceries”. Letter case and spaces don’t make a new tag." ] }
            )
          )
        end
      end

      response "400", "the name is missing or not a string, or the colour is neither a string nor null" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:tag) { { name: "Cinema", colour: 3 } }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
      end

      response "401", "no session" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:tag) { { name: "Cinema" } }

        run_test!
      end
    end
  end

  describe "listing tags" do
    it "says when each was last put on a transaction, and an edit that keeps a tag doesn't move it" do
      marta = create(:user, password: "correct horse battery")
      party, lidl, _unused = [ "Party", "Lidl", "Unused" ].map { create(:tag, user: marta, name: it) }
      rent = travel_to(Time.utc(2026, 10, 1, 12)) { create(:transaction, user: marta, tags: [ party ]) }
      travel_to(Time.utc(2026, 10, 5, 12)) { create(:transaction, user: marta, tags: [ party ]) }
      travel_to Time.utc(2026, 10, 9, 12)
      sign_in_as marta, password: "correct horse battery"
      patch "/api/transactions/#{rent.id}", params: { amount: 100, kind: "expense", date: "2026-10-01", tag_ids: [ party.id, lidl.id ] }, as: :json

      get "/api/tags"

      expect(response.parsed_body["data"].to_h { [ it["name"], it["last_used_at"] ] })
        .to eq("Lidl" => "2026-10-09T12:00:00.000Z", "Party" => "2026-10-05T12:00:00.000Z", "Unused" => nil)
    end
  end

  describe "creating a tag" do
    it "refuses a name that is blank once trimmed, longer than 40 or holds a NUL, and a colour not on the palette" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      refusals = [ { name: "  \u00a0 " }, { name: "x" * 41 }, { name: "a\u0000b" }, { name: "Cinema", colour: "teal" } ].map do |body|
        post("/api/tags", params: body, as: :json) && [ response.status, response.parsed_body["errors"].keys ]
      end

      expect(refusals).to eq([ [ 422, [ "name" ] ], [ 422, [ "name" ] ], [ 422, [ "name" ] ], [ 422, [ "colour" ] ] ])
    end

    it "keeps a name of exactly 40 once trimmed, with a palette colour" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      post "/api/tags", params: { name: "\u00a0#{"x" * 40} ", colour: "mint" }, as: :json

      expect(response).to have_attributes(status: 201, parsed_body: include("name" => "x" * 40, "colour" => "mint"))
    end

    it "refuses a name that is missing or not a string, and a colour that is neither a string nor null" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      statuses = [ {}, { name: "" }, { name: 12 }, { name: [ "Cinema" ] }, { name: "Cinema", colour: [ "mint" ] }, { name: "Cinema", colour: { "x" => 1 } } ]
        .map { post("/api/tags", params: it, as: :json) && response.status }

      expect(statuses).to eq([ 400, 400, 400, 400, 400, 400 ])
    end

    # Literal 404 specs come with the first route that takes a tag id.
    it "keeps another user's tags out of reach (no id route yet): their name doesn't block mine, their id never reaches me" do
      theirs = create(:tag, name: "Groceries")
      marta = create(:user, password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"

      post "/api/tags", params: { name: "groceries" }, as: :json

      expect(response).to have_attributes(status: 201, parsed_body: include("name" => "groceries").and(not_include("id" => theirs.id)))
    end

    it "keeps a name with Polish letters apart from the same name without them" do
      marta = create(:user, password: "correct horse battery")
      create(:tag, user: marta, name: "Zabka")
      sign_in_as marta, password: "correct horse battery"

      post "/api/tags", params: { name: "Żabka" }, as: :json

      expect(response).to have_attributes(status: 201, parsed_body: include("name" => "Żabka"))
    end

    it "takes a name typed with a combining accent as the same name as its composed form" do
      marta = create(:user, password: "correct horse battery")
      create(:tag, user: marta, name: "\u017babka")
      sign_in_as marta, password: "correct horse battery"

      post "/api/tags", params: { name: " z\u0307abka" }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("type" => "tag-name-taken"))
    end

    it "answers name taken when another request adds the name between the check and the insert" do
      marta = create(:user, password: "correct horse battery")
      sign_in_as marta, password: "correct horse battery"
      # The first lookup misses the other request's row, as if it was inserted just after.
      winner_id = nil
      allow(Tag).to receive(:find_by).and_wrap_original do |original, *args|
        next original.call(*args) if winner_id

        winner_id = Tag.insert_all([ { user_id: marta.id, name: "Cinema", normalized_name: "cinema" } ], returning: :id).first["id"] # rubocop:disable Rails/SkipsModelValidations -- the other request's row, straight to the table
        nil
      end

      post "/api/tags", params: { name: "CINEMA " }, as: :json

      expect(response).to have_attributes(status: 422, parsed_body: include("type" => "tag-name-taken", "existing_id" => winner_id))
    end
  end
end

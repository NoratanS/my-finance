# frozen_string_literal: true

require "swagger_helper"

RSpec.describe "Tags", type: :request do
  path "/api/tags" do
    get "Lists the signed-in user's tags with their totals, most spent first, income-only tags last" do
      tags "Tags"
      operationId "listTags"
      produces "application/json", "application/problem+json"
      parameter name: :period, in: :query, required: false, schema: { "$ref" => "#/components/schemas/TagPeriod" },
                description: "Calendar months the amounts cover, this one included; this month when absent"

      response "200", "only my tags; with nothing spent or earned, A–Z ignoring case" do
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

      response "400", "the period isn't 1, 3 or 12" do
        schema "$ref" => "#/components/schemas/Problem"
        let(:period) { "6" }

        before { sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery" }

        run_test!
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
          expect(response.parsed_body).to match(
            "id" => be_a(Integer), "name" => "Eating Out", "colour" => nil, "last_used_at" => nil, "expense" => 0, "income" => 0, "transaction_count" => 0
          )
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

    it "totals each tag's expenses, income and transactions over this month by default, in Warsaw time" do
      marta = create(:user, password: "correct horse battery")
      allegro = create(:tag, user: marta, name: "Allegro")
      [ [ 31_200, "expense", "2026-10-01" ], [ 8_900, "income", "2026-10-31" ], [ 500, "expense", "2026-09-30" ] ]
        .each { |amount, kind, date| create(:transaction, user: marta, amount:, kind:, date:, tags: [ allegro ]) }
      # 22:30 UTC on 30 September is already 1 October in Warsaw.
      travel_to Time.utc(2026, 9, 30, 22, 30)
      sign_in_as marta, password: "correct horse battery"

      get "/api/tags"

      expect(response.parsed_body).to include(
        "data" => [ include("name" => "Allegro", "expense" => 31_200, "income" => 8_900, "transaction_count" => 2) ]
      )
    end

    it "totals the last 3 or 12 calendar months, this one included, and says which" do
      marta = create(:user, password: "correct horse battery")
      home = create(:tag, user: marta, name: "Home")
      [ "2025-11-30", "2025-12-01", "2026-08-31", "2026-09-01", "2026-11-14" ]
        .each_with_index { |date, index| create(:transaction, user: marta, amount: 10**index, date:, tags: [ home ]) }
      travel_to Time.utc(2026, 11, 14, 12)
      sign_in_as marta, password: "correct horse battery"

      totals = [ "3", "12" ].map { get("/api/tags", params: { period: it }) && response.parsed_body }

      expect(totals.map { [ it["meta"]["period"], it["data"].sole.values_at("expense", "transaction_count") ] })
        .to eq([ [ "3", [ 11_000, 2 ] ], [ "12", [ 11_110, 4 ] ] ])
    end

    it "counts a transaction in each of its tags, and sorts by expenses, then income, income-only tags last" do
      marta = create(:user, password: "correct horse battery")
      home, allegro, salary, gift = [ "Home", "Allegro", "Salary", "Gift", "Unused", "aardvark" ].map { create(:tag, user: marta, name: it) }
      [ [ 200_000, "expense", [ home, allegro ] ], [ 30_000, "expense", [ home ] ], [ 1_200, "expense", [ allegro ] ],
        [ 8_900, "income", [ allegro ] ], [ 820_000, "income", [ salary ] ], [ 5_000, "income", [ gift ] ] ]
        .each { |amount, kind, tags| create(:transaction, user: marta, amount:, kind:, tags:) }
      sign_in_as marta, password: "correct horse battery"

      get "/api/tags"

      expect(response.parsed_body["data"].map { it.values_at("name", "expense", "income", "transaction_count") }).to eq(
        [ [ "Home", 230_000, 0, 2 ], [ "Allegro", 201_200, 8_900, 3 ], [ "aardvark", 0, 0, 0 ], [ "Unused", 0, 0, 0 ], [ "Salary", 0, 820_000, 1 ], [ "Gift", 0, 5_000, 1 ] ]
      )
    end

    it "sorts tags with the same totals A–Z the Polish way, so Łódź sits between Kino and Zakupy" do
      marta = create(:user, password: "correct horse battery")
      [ "Zakupy", "Łódź", "kino" ].each { create(:tag, user: marta, name: it) }
      sign_in_as marta, password: "correct horse battery"

      get "/api/tags"

      expect(response.parsed_body["data"].pluck("name")).to eq([ "kino", "Łódź", "Zakupy" ])
    end

    it "counts my untagged transactions over all time, whatever the period" do
      marta = create(:user, password: "correct horse battery")
      create(:transaction, user: marta, date: "2020-01-15")
      create(:transaction, user: marta)
      create(:transaction, user: marta, tags: [ create(:tag, user: marta) ])
      create(:transaction)
      sign_in_as marta, password: "correct horse battery"

      get "/api/tags", params: { period: "1" }

      expect(response.parsed_body["meta"]).to eq("period" => "1", "untagged_count" => 2)
    end

    it "refuses a period other than 1, 3 or 12 months" do
      sign_in_as create(:user, password: "correct horse battery"), password: "correct horse battery"

      statuses = [ "", "01", "6", "all", "2026-10" ].map { get("/api/tags", params: { period: it }) && response.status }
      get "/api/tags?period[]=3"

      expect(statuses << response.status).to eq([ 400, 400, 400, 400, 400, 400 ])
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

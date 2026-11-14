# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_11_14_170100) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "unaccent"

  create_table "invites", force: :cascade do |t|
    t.string "email", null: false
    t.string "token_digest", null: false
    t.datetime "expires_at", null: false
    t.datetime "accepted_at"
    t.bigint "created_by_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_by_id"], name: "index_invites_on_created_by_id"
    t.index ["email"], name: "index_invites_on_email", unique: true, where: "(accepted_at IS NULL)"
    t.index ["token_digest"], name: "index_invites_on_token_digest", unique: true
  end

  create_table "sessions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "ip_address"
    t.string "user_agent"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "tag_groups", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.string "normalized_name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id", "normalized_name"], name: "index_tag_groups_on_user_id_and_normalized_name", unique: true
    t.check_constraint "char_length(name::text) >= 1 AND char_length(name::text) <= 40", name: "tag_groups_name_length"
  end

  create_table "tags", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.string "normalized_name", null: false
    t.string "colour"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "tag_group_id"
    t.index ["tag_group_id"], name: "index_tags_on_tag_group_id"
    t.index ["user_id", "normalized_name"], name: "index_tags_on_user_id_and_normalized_name", unique: true
    t.check_constraint "char_length(name::text) >= 1 AND char_length(name::text) <= 40", name: "tags_name_length"
    t.check_constraint "colour::text = ANY (ARRAY['lavender'::character varying::text, 'mint'::character varying::text, 'sky'::character varying::text, 'peach'::character varying::text, 'rose'::character varying::text, 'butter'::character varying::text, 'lilac'::character varying::text, 'seafoam'::character varying::text])", name: "tags_colour_known"
  end

  create_table "transaction_tags", force: :cascade do |t|
    t.bigint "transaction_id", null: false
    t.bigint "tag_id", null: false
    t.datetime "created_at", null: false
    t.index ["tag_id"], name: "index_transaction_tags_on_tag_id"
    t.index ["transaction_id", "tag_id"], name: "index_transaction_tags_on_transaction_id_and_tag_id", unique: true
  end

  create_table "transactions", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.bigint "amount", null: false
    t.string "kind", null: false
    t.date "date", null: false
    t.string "description", default: "", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id", "date", "id"], name: "index_transactions_on_user_id_and_date_and_id", order: { date: :desc, id: :desc }
    t.check_constraint "amount > 0 AND amount <= '99999999999'::bigint", name: "transactions_amount_range"
    t.check_constraint "char_length(description::text) <= 200", name: "transactions_description_length"
    t.check_constraint "date >= '2000-01-01'::date", name: "transactions_date_floor"
    t.check_constraint "kind::text = ANY (ARRAY['expense'::character varying::text, 'income'::character varying::text])", name: "transactions_kind_known"
  end

  create_table "users", force: :cascade do |t|
    t.string "email", null: false
    t.string "password_digest", null: false
    t.boolean "admin", default: false, null: false
    t.string "currency", default: "PLN", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "invites", "users", column: "created_by_id"
  add_foreign_key "sessions", "users"
  add_foreign_key "tag_groups", "users"
  add_foreign_key "tags", "tag_groups", on_delete: :nullify
  add_foreign_key "tags", "users"
  add_foreign_key "transaction_tags", "tags", on_delete: :cascade
  add_foreign_key "transaction_tags", "transactions", on_delete: :cascade
  add_foreign_key "transactions", "users"
end

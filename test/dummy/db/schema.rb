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

ActiveRecord::Schema[8.0].define(version: 2026_09_19_112519) do
  create_table "demo_settings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.decimal "discount_percent", precision: 5, scale: 2, default: "0.0", null: false
    t.boolean "notifications", default: true, null: false
    t.integer "tokens_granted", default: 0, null: false
    t.datetime "updated_at", null: false
    t.string "workspace_name", default: "Fern & Co.", null: false
    t.text "workspace_note", default: "", null: false
  end

  create_table "demo_users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "name", null: false
    t.string "plan", default: "free", null: false
    t.string "status", default: "active", null: false
    t.integer "token_balance", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_demo_users_on_email", unique: true
    t.check_constraint "token_balance >= 0", name: "positive_token_balance"
  end
end

class CreateDemoRecords < ActiveRecord::Migration[8.0]
  def change
    create_table :demo_users do |t|
      t.string :name, null: false
      t.string :email, null: false
      t.string :plan, null: false, default: "free"
      t.integer :token_balance, null: false, default: 0
      t.string :status, null: false, default: "active"
      t.timestamps
    end
    add_index :demo_users, :email, unique: true
    add_check_constraint :demo_users, "token_balance >= 0", name: "positive_token_balance"

    create_table :demo_settings do |t|
      t.string :workspace_name, null: false, default: "Fern & Co."
      t.text :workspace_note, null: false, default: ""
      t.boolean :notifications, null: false, default: true
      t.decimal :discount_percent, precision: 5, scale: 2, null: false, default: 0
      t.integer :tokens_granted, null: false, default: 0
      t.timestamps
    end
  end
end

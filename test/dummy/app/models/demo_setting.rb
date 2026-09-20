class DemoSetting < ActiveRecord::Base
  normalizes :workspace_name, with: ->(value) { value.strip }
  validates :workspace_name, presence: true, length: { maximum: 100 }
  validates :workspace_note, length: { maximum: 2000 }
  validates :notifications, inclusion: { in: [true, false] }
  validates :discount_percent, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 }
end

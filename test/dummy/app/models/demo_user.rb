class DemoUser < ActiveRecord::Base
  ACCOUNT_ID = 1
  PLANS = { "Free" => "free", "Premium" => "premium", "Premium Plus" => "premium_plus" }.freeze

  normalizes :name, with: ->(value) { value.strip }
  normalizes :email, with: ->(value) { value.strip.downcase }
  validates :name, presence: true, length: { maximum: 100 }
  validates :email, presence: true, length: { maximum: 254 }, format: { with: URI::MailTo::EMAIL_REGEXP }, uniqueness: true
  validates :plan, inclusion: { in: PLANS.values }
  validates :status, inclusion: { in: %w[active inactive] }
  validates :token_balance, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1_000_000_000 }

  def plan_label
    PLANS.key(plan)
  end
end

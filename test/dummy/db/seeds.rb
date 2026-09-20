[
  [1, "Jamie Davis", "jamie@example.com", "free", 0],
  [42, "Alex Morgan", "alex@example.com", "premium", 1200],
  [73, "Sam Rivera", "sam@example.com", "free", 50],
  [108, "Taylor Kim", "taylor@example.com", "premium_plus", 5000],
].each do |id, name, email, plan, balance|
  DemoUser.find_or_create_by!(id: id) do |user|
    user.assign_attributes(name: name, email: email, plan: plan, token_balance: balance)
  end
end

load Rails.root.join("db/seeds/additional_users.rb")
DemoSetting.find_or_create_by!(id: 1)

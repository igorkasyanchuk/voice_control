[
  "Jordan Brooks", "Casey Chen", "Riley Patel", "Morgan Ellis", "Avery Johnson",
  "Cameron Reed", "Quinn Parker", "Dakota Hayes", "Rowan Bennett", "Skyler Walsh",
  "Emerson Lee", "Finley Torres", "Harper Collins", "Logan Rivera", "Peyton Foster",
  "Reese Sullivan", "Sage Mitchell", "Drew Anderson", "Blake Nguyen", "Charlie Evans",
].each_with_index do |name, index|
  DemoUser.find_or_create_by!(email: "demo.user#{index + 1}@example.com") do |user|
    user.assign_attributes(
      name: name,
      plan: DemoUser::PLANS.values[index % DemoUser::PLANS.size],
      token_balance: [0, 75, 250, 800, 1500, 3200, 7500][index % 7],
      status: index % 5 == 4 ? "inactive" : "active",
    )
  end
end

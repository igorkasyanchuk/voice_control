Lazzzy.configure do |config|
  config.authorize = -> { demo_admin? }
  config.api_key = ENV["JEV_API_KEY"].presence || ENV["TYPESAFE_API_KEY"].presence unless Rails.env.test?
  config.interpreter = config.api_key.present? ? Lazzzy::Jev.new : DemoInterpreter.new
  config.browser_actions = true
  config.debug = !Rails.env.test?

  config.group "Go somewhere" do
    %w[overview users orders products reports settings activity].each do |page|
      aliases = [page, page.singularize].uniq.flat_map { |name| ["open #{name}", "go to #{name}", "show #{name}"] }
      config.command "open_#{page}", description: "Open #{page}", aliases: aliases, examples: ["open #{page}"] do
        execute { |_args, _context| Lazzzy::Result.navigate(page == "overview" ? "/" : "/#{page}") }
      end
    end
  end

  config.group "People & permissions" do
    config.command :give_tokens, description: "Give tokens", aliases: ["give", "add tokens"], examples: ["give user 42 100 tokens"] do
      argument :user_id, :integer, prompt: "Which user ID? Try 42.", extract: ->(text, _context) { text[/\buser\s+(\d+)/i, 1] }, validate: ->(value) { value.positive? }
      argument :amount, :integer, prompt: "How many tokens?", extract: ->(text, _context) { text[/\b(\d+)\s+tokens\b/i, 1] }, validate: ->(value) { value.between?(1, 10_000) }
      execute do |args, _context|
        user = DemoUser.find_by(id: args[:user_id])
        raise Lazzzy::InvalidInput, "That demo user does not exist." unless user

        DemoUser.transaction do
          user.with_lock do
            raise Lazzzy::InvalidInput, "That grant exceeds the demo balance limit." if user.token_balance + args[:amount] > 1_000_000_000

            user.update!(token_balance: user.token_balance + args[:amount])
          end
          workspace_settings.with_lock { workspace_settings.increment!(:tokens_granted, args[:amount]) }
        end
        Lazzzy::Result.event("demo:tokens", args.merge(balance: user.token_balance, total: workspace_settings.tokens_granted))
      end
    end
    config.command :set_plan, description: "Change my account plan",
      aliases: ["set plan", "change plan", "change my plan", "set my plan", "upgrade my account", "downgrade my account"],
      examples: ["change my plan to premium", "set my plan to premium plus", "change my plan to free"] do
      argument :plan, :enum, values: %w[free premium premium_plus],
        prompt: "Which plan would you like? Free, Premium, or Premium Plus?",
        extract: ->(text, _context) { text[/\b(premium(?:[ _]+plus)?|free)\b/i]&.downcase&.tr(" ", "_") }
      execute do |args, _context|
        demo_account.update!(plan: args[:plan])
        Lazzzy::Result.event("demo:plan", args)
      end
    end
    config.command :announce, description: "Show announcement", aliases: ["announce"], examples: ["show announcement"] do
      argument :text, :string, prompt: "What should the announcement say?"
      execute { |args, _context| Lazzzy::Result.event("demo:announcement", args) }
    end
  end

  config.group "Workspace tools" do
    config.command :discount, description: "Set discount", aliases: ["set discount"], examples: ["set discount"] do
      argument :percent, :decimal, validate: ->(value) { BigDecimal(value).between?(0, 100) }, prompt: "What discount percentage? Try 12.5."
      execute do |args, _context|
        workspace_settings.update!(discount_percent: args[:percent])
        Lazzzy::Result.event("demo:discount", args)
      end
    end
    config.command :notifications, description: "Change notifications", aliases: ["notifications"], examples: ["change notifications"] do
      argument :enabled, :boolean, prompt: "Enable notifications? Say yes or no."
      execute do |args, _context|
        workspace_settings.update!(notifications: args[:enabled])
        Lazzzy::Result.event("demo:notifications", args)
      end
    end
  end
end

Lazzzy.configure do |config|
  config.api_key = ENV["JEV_API_KEY"]
  config.parent_controller = "ApplicationController"
  config.authorize = -> { false } # Replace with your access check, e.g. current_user&.admin?
  config.keyboard_shortcut = "mod+shift+u" # nil disables the shortcut.
  config.push_to_talk_shortcut = "mod+shift+space" # Hold to speak, release to submit; nil disables.
  config.widget_position = :bottom_right # Or :bottom_left.
  config.browser_actions = false # true sends visible control labels/IDs to Jev for dynamic click/fill/focus.
  config.debug = false # Show the latest command's matching and execution diagnostics in the widget.
  # Defaults to Rails.cache, with a MemoryStore fallback for development NullStore.
  # Production needs a shared atomic cache; see docs/deployment.md.
  # config.execution_store = -> { Rails.cache }

  config.group "Navigation" do
    config.command :home, description: "Open home", aliases: ["go home"], examples: ["open home"] do
      execute { |_args, _context| Lazzzy::Result.navigate(main_app.root_path) }
    end
  end
end

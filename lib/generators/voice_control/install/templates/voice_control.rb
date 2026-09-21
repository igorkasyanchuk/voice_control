VoiceControl.configure do |config|
  # Server-side Jev API key; accepts a string or a zero-argument callable.
  config.api_key = ENV["JEV_API_KEY"]

  # Jev model used to match natural-language commands to your vocabulary.
  config.model = "jev-latest"

  # Engine endpoints inherit this controller's authentication and callbacks.
  config.parent_controller = "ApplicationController"

  # Controls access to the widget and endpoints. Replace with your own access check.
  # For example: -> { current_user&.admin? }. Access is denied until configured.
  config.authorize = -> { false }

  # Binds execution tickets to an account as well as its session; defaults to current_user.id when available.
  # Override this for another authentication system.
  # config.identity = -> { current_account.id }

  # Filters browser-supplied context before matching; defaults to passing it through.
  # Keep only the keys your commands need, especially if URLs contain private query parameters.
  # config.context = ->(client_context) { client_context.slice("path") }

  # Discovers labeled page controls for click, fill, select, check, scroll and submit commands.
  # Sends control labels/IDs and dropdown labels to Jev; existing field values are excluded.
  config.browser_actions = false

  # Open/close shortcut; mod is Cmd on macOS and Ctrl elsewhere. Set nil to disable.
  config.keyboard_shortcut = "mod+shift+u"

  # Hold to speak, release to submit. Set nil to disable this shortcut.
  config.push_to_talk_shortcut = "mod+shift+space"

  # Corner for the launcher and panel: :bottom_right or :bottom_left.
  config.widget_position = :bottom_right

  # :small uses a 44px button and 20px icon; :normal uses 56px and 24px. Panel width is unchanged.
  config.launcher_size = :normal

  # Close and stop listening after this many milliseconds of inactivity; use a positive number.
  config.idle_timeout = 120_000

  # Maximum milliseconds per request, including reading its response; execution timeouts never retry automatically.
  config.request_timeout = 30_000

  # Matches below this confidence ask for disambiguation. Calibrate for your vocabulary.
  config.confidence_threshold = 0.35

  # Shows the latest transcript, matching details, Jev result and execution timing in the widget.
  # Enable for trusted users while troubleshooting; copied details may contain private data.
  config.debug = false

  # Defaults to Rails.cache, with a MemoryStore fallback for development NullStore.
  # Production needs a shared atomic cache for replay protection; see docs/deployment.md.
  # config.execution_store = -> { Rails.cache }

  # Optional matcher accepting transcript:, context:, commands:; nil uses Jev.
  # Return command:, confidence:, candidates: without executing an action; see docs/configuration.md.
  config.interpreter = nil

  # Receives unexpected errors and command/controller details; the UI shows a generic message.
  # The default logs only the error class and command key. Replace with your error tracker if needed.
  # config.on_error = ->(error, details) { Rails.logger.error("VoiceControl #{error.class} command=#{details[:command]}") }

  config.group "Navigation" do
    config.command :home, description: "Open home", aliases: ["go home"], examples: ["open home"] do
      execute { |_args, _context| VoiceControl::Result.navigate(main_app.root_path) }
    end
  end
end

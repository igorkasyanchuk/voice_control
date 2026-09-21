module VoiceControl
  class Configuration
    attr_accessor :api_key, :model, :parent_controller, :authorize, :context,
      :on_error, :interpreter, :keyboard_shortcut, :idle_timeout, :confidence_threshold,
      :execution_store, :identity, :browser_actions, :debug, :push_to_talk_shortcut
    attr_reader :commands, :widget_position, :launcher_size, :request_timeout, :speech_language

    def initialize
      @model = "jev-latest"
      @parent_controller = "ApplicationController"
      @authorize = -> { false }
      @identity = -> { respond_to?(:current_user, true) ? current_user&.id : nil }
      @context = ->(client_context) { client_context }
      @on_error = ->(error, details) { Rails.logger.error("VoiceControl #{error.class} command=#{details[:command]}") }
      @keyboard_shortcut = "mod+shift+u"
      @idle_timeout = 120_000
      @request_timeout = 30_000
      @confidence_threshold = 0.35
      development_store = ActiveSupport::Cache::MemoryStore.new if Rails.env.development?
      @execution_store = -> { Rails.cache.is_a?(ActiveSupport::Cache::NullStore) && development_store ? development_store : Rails.cache }
      @commands = {}
      @browser_actions = false
      @debug = false
      @widget_position = :bottom_right
      @launcher_size = :normal
      @push_to_talk_shortcut = "mod+shift+space"
      @speech_language = "en-US"
    end

    def speech_language=(value)
      raise ArgumentError, "Speech language must be a BCP 47 tag such as en-US or uk-UA" unless value.is_a?(String) && value.match?(/\A[a-z]{2,3}(?:-[a-z0-9]{1,8})*\z/i)

      @speech_language = value
    end

    def widget_position=(value)
      raise ArgumentError, "Widget position must be bottom_right or bottom_left" unless %w[bottom_right bottom_left].include?(value.to_s)

      @widget_position = value.to_sym
    end

    def request_timeout=(value)
      raise ArgumentError, "Request timeout must be an integer from 1,000 to 300,000 milliseconds" unless value.is_a?(Integer) && value.between?(1_000, 300_000)

      @request_timeout = value
    end

    def launcher_size=(value)
      raise ArgumentError, "Launcher size must be normal or small" unless %w[normal small].include?(value.to_s)

      @launcher_size = value.to_sym
    end

    def group(name, &block)
      previous = @group
      @group = name.to_s
      block.call(self)
    ensure
      @group = previous
    end

    def command(key, **options, &block)
      key = key.to_s
      raise ArgumentError, "Duplicate command: #{key}" if commands.key?(key)
      raise ArgumentError, "Invalid command key" unless key.match?(/\A[a-z][a-z0-9_]*\z/) && key != "none"
      raise ArgumentError, "Reserved browser command key" if key.start_with?(BrowserActions::PREFIX)

      commands[key] = Command.new(key, group: @group || "Commands", **options, &block)
    end
  end
end

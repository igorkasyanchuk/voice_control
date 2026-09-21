require_relative "test_helper"

class CommandsTest < VoiceControlTest
  def test_reload_can_opt_into_a_completion_notification
    @config.command :saved, description: "Save account" do
      execute { |_args, _context| VoiceControl::Result.reload(notify: "Plan updated.") }
    end
    result = submit(command: "saved")
    assert_equal({ "kind" => "reload", "notification" => "Plan updated." }, execute(result.fetch("ticket")))
  end

  def test_initializer_template_denies_access_until_configured_and_registers_working_navigation
    @config.commands.clear
    load File.expand_path("../lib/generators/voice_control/install/templates/voice_control.rb", __dir__)
    get "/voice_control/commands"
    assert_response :forbidden
    @config.authorize = -> { demo_admin? }
    result = submit(command: "home")
    assert_equal({ "kind" => "navigate", "url" => "/" }, execute(result.fetch("ticket")))
    assert_equal :normal, @config.launcher_size
    assert_equal false, @config.browser_actions
  end

  def test_successful_commands_can_reload_the_current_page
    @config.command :refresh, description: "Refresh after saving" do
      execute { |_args, _context| VoiceControl::Result.reload }
    end
    result = submit(command: "refresh")
    assert_equal({ "kind" => "reload" }, execute(result.fetch("ticket")))
    assert_response :success
  end

  def test_widget_renders_and_does_not_leak_key
    @config.api_key = "secret-api-key"
    get "/"
    assert_select "voice-control-widget[data-turbo-permanent]", 1
    assert_select 'script[src^="/voice_control/widget.js"]', 1 do |scripts|
      assert_match(/\?v=[a-f0-9]{12}\z/, scripts.first["src"])
    end
    refute_includes response.body, "secret-api-key"
    get "/", headers: { "X-Demo-Role" => "guest" }
    assert_select "voice-control-widget", 0
  end

  def test_catalog_is_authorized_and_contains_argument_schema
    get "/voice_control/commands"
    assert_response :success
    assert_equal "no-store", response.headers["Cache-Control"]
    assert_equal "integer", response.parsed_body["commands"].first["arguments"].first["type"]
    get "/voice_control/commands", headers: { "X-Demo-Role" => "guest" }
    assert_response :forbidden
  end

  def test_interpretation_does_not_execute_and_ticket_executes_once
    result = submit(transcript: "give user 42 100 tokens")
    assert_equal "execute", result["kind"]
    assert_empty @events
    assert_equal "Granted 100 tokens", execute(result["ticket"])["message"]
    assert_equal [{ user_id: 42, amount: 100 }], @events
    execute(result["ticket"])
    assert_response :unprocessable_content
    assert_equal 1, @events.length
  end

  def test_missing_arguments_and_invalid_followups
    result = submit(command: "grant")
    assert_equal "question", result["kind"]
    result = submit(transcript: "42", continuation: result["continuation"])
    assert_equal "question", result["kind"]
    result = submit(transcript: "-100", continuation: result["continuation"])
    assert_equal "question", result["kind"]
    result = submit(transcript: "100", continuation: result["continuation"])
    assert_equal "execute", result["kind"]
    execute(result["ticket"])
    assert_equal [{ user_id: 42, amount: 100 }], @events
  end

  def test_replaying_a_followup_cannot_execute_twice
    result = submit(transcript: "give user 42")
    first = submit(transcript: "100", continuation: result["continuation"])
    second = submit(transcript: "200", continuation: result["continuation"])
    execute(first["ticket"])
    execute(second["ticket"])
    assert_response :unprocessable_content
    assert_equal [{ user_id: 42, amount: 100 }], @events
  end

  def test_execution_rechecks_access
    result = submit(transcript: "give user 42 100 tokens")
    execute(result["ticket"], headers: { "X-Demo-Role" => "guest" })
    assert_response :forbidden
    assert_empty @events
  end

  def test_command_visibility_and_target_permission
    allowed = true
    @config.command :private, description: "Private", visible: -> { allowed }, authorize: ->(args, _context) { args[:user_id] == 42 } do
      argument :user_id, :integer
      execute { |_args, _context| VoiceControl::Result.message("OK") }
    end
    result = submit(command: "private")
    submit(transcript: "7", continuation: result["continuation"])
    assert_response :forbidden
    result = submit(command: "private")
    result = submit(transcript: "42", continuation: result["continuation"])
    allowed = false
    execute(result["ticket"])
    assert_response :forbidden
    get "/voice_control/commands"
    refute response.parsed_body["commands"].any? { |command| command["key"] == "private" }
  end

  def test_csrf_protection_for_both_posts
    post "/voice_control/interpret", params: { command: "home" }, as: :json
    assert_response :unprocessable_content
    assert_match "session changed", response.parsed_body["message"]
    post "/voice_control/execute", params: { ticket: "bad" }, as: :json
    assert_response :unprocessable_content
    assert_empty @events
  end

  def test_tampered_expired_and_cross_session_tickets
    result = submit(transcript: "give user 42 100 tokens")
    execute(result["ticket"] + "tampered")
    assert_response :unprocessable_content
    travel 11.minutes do
      execute(result["ticket"])
      assert_response :unprocessable_content
    end
    other = open_session
    other.get "/"
    token = Nokogiri::HTML(other.response.body).at_css('meta[name="csrf-token"]')["content"]
    other.post "/voice_control/execute", params: { ticket: result["ticket"] }, as: :json, headers: { "X-CSRF-Token" => token }
    assert_equal 422, other.response.status
    assert_empty @events
  end

  def test_identity_change_invalidates_tickets
    identity = "admin-1"
    @config.identity = -> { identity }
    result = submit(transcript: "give user 42 100 tokens")
    identity = "admin-2"
    execute(result["ticket"])
    assert_response :unprocessable_content
    assert_empty @events
  end

  def test_ambiguous_selection_keeps_original_arguments
    @config.interpreter = ->(**_args) { { command: "grant", confidence: 0.1, candidates: %w[grant home] } }
    result = submit(transcript: "give user 42 100 tokens")
    assert_equal "ambiguous", result["kind"]
    result = submit(transcript: "one", continuation: result["continuation"])
    assert_equal "execute", result["kind"]
    execute(result["ticket"])
    assert_equal [{ user_id: 42, amount: 100 }], @events
  end

  def test_unknown_command_and_oversized_input_do_not_execute
    submit(command: "arbitrary_method")
    assert_response :forbidden
    submit(transcript: "a" * 2001)
    assert_response :unprocessable_content
    submit(command: "home", context: { secret: "a" * 4097 })
    assert_response :unprocessable_content
    assert_empty @events
  end

  def test_errors_are_reported_without_exposing_details_and_not_retried
    reported = []
    @config.on_error = ->(exception, details) { reported << [exception, details] }
    @config.command :broken, description: "Broken" do
      execute { |_args, _context| raise "private provider secret" }
    end
    result = submit(command: "broken")
    execute(result["ticket"])
    assert_response :internal_server_error
    refute_includes response.body, "private provider secret"
    assert_equal "private provider secret", reported.first.first.message
    assert_equal "broken", reported.first.last[:command]
    execute(result["ticket"])
    assert_response :unprocessable_content
    assert_equal 1, reported.length
  end

  def test_null_cache_fails_closed
    @config.execution_store = -> { ActiveSupport::Cache::NullStore.new }
    result = submit(transcript: "give user 42 100 tokens")
    execute(result["ticket"])
    assert_response :internal_server_error
    assert_empty @events
  end

  def test_oversized_signed_state_is_rejected_before_issuing_an_unusable_ticket
    @config.command :large, description: "Large" do
      argument :value, :string, extract: ->(text, _context) { text }
      execute { |_args, _context| VoiceControl::Result.message("Done") }
    end
    result = submit(command: "large", transcript: "😀" * 2000, context: { note: "x" * 4000 })
    if result["ticket"]
      assert_operator result["ticket"].bytesize, :<=, 32_768
      execute(result["ticket"])
      assert_response :success
    else
      assert_response :unprocessable_content
      assert_match(/too large/, result["message"])
    end
  end

  def test_public_assets_are_available_without_authentication
    get "/voice_control/widget.js", headers: { "X-Demo-Role" => "guest" }
    assert_response :success
    assert_includes response.body, "customElements.define"
    get "/voice_control/widget.css"
    assert_response :success
    assert_includes response.body, ":host"
  end
end

class ConversationConcurrencyTest < Minitest::Test
  class RequestContext
    attr_reader :session

    def initialize
      @session = {}
    end
  end

  def test_concurrent_execution_only_invokes_the_action_once
    original = VoiceControl.configuration
    config = VoiceControl::Configuration.new
    cache = ActiveSupport::Cache::MemoryStore.new
    config.execution_store = -> { cache }
    calls = Queue.new
    config.command :run_once, description: "Run once" do
      execute do |_args, _context|
        calls << :called
        VoiceControl::Result.message("Done")
      end
    end
    VoiceControl.instance_variable_set(:@configuration, config)
    conversation = VoiceControl::Conversation.new(RequestContext.new)
    result = conversation.interpret(transcript: "", client_context: {}, command_key: "run_once")
    threads = 8.times.map do
      Thread.new do
        conversation.execute(result[:ticket])
      rescue VoiceControl::InvalidInput
        :already_submitted
      end
    end
    results = threads.map(&:value)
    assert_equal 1, calls.size
    assert_equal 7, results.count(:already_submitted)
  ensure
    VoiceControl.instance_variable_set(:@configuration, original)
  end
end

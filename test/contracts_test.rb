require_relative "test_helper"

class ContractsTest < VoiceControlTest
  def test_completion_notifications_are_optional_and_bounded
    result = VoiceControl::Result
    [result.message("Done", notify: "Saved"), result.reload(notify: "Saved"),
      result.navigate("/", notify: "Saved"), result.event("app:updated", { id: 1 }, notify: "Saved"),
      result.click("#save", notify: "Saved"), result.fill("#name", "Alice", notify: "Saved"), result.focus("#name", notify: "Saved")].each do |value|
      assert_equal "Saved", value[:notification]
    end
    assert_equal({ id: 1 }, result.event("app:updated", id: 1)[:detail])
    ["", " ", true, "x" * 201].each do |text|
      assert_raises(VoiceControl::InvalidInput) { result.reload(notify: text) }
    end
    refute result.reload.key?(:notification)
    assert_equal "Saved", result.reload(notify: " Saved ")[:notification]
  end

  def test_argument_defaults_booleans_and_registration_errors
    context = Object.new
    definition = VoiceControl::Argument.new(:enabled, :boolean, default: ->(_text, data) { data.fetch("enabled") })
    value = definition.initial_value(context, "", { "enabled" => "yes" })
    assert_equal true, definition.coerce(value, controller: context)
    assert_raises(ArgumentError) { @config.command(:missing, description: "Missing") {} }
    assert_raises(ArgumentError) do
      @config.command :duplicate, description: "Duplicate" do
        argument :id, :integer
        argument :id, :integer
        execute { VoiceControl::Result.message("Never") }
      end
    end
    assert_raises(VoiceControl::InvalidInput) { VoiceControl::Result.event("bad event!") }
  end

  def test_default_identity_supports_authenticated_anonymous_and_controller_without_authentication
    identity = VoiceControl::Configuration.new.identity
    scope = Struct.new(:current_user).new(Struct.new(:id).new(42))
    assert_equal 42, scope.instance_exec(&identity)
    scope.current_user = nil
    assert_nil scope.instance_exec(&identity)
    assert_nil Object.new.instance_exec(&identity)
  end

  def test_empty_commands_invalid_filtered_context_and_invalid_tickets_are_rejected
    submit(transcript: "  ")
    assert_response :unprocessable_content
    post "/voice_control/interpret", params: { command: "home" }, as: :json, headers: { "X-CSRF-Token" => @csrf }
    assert_response :success
    @config.context = ->(_context) { "not a hash" }
    submit(command: "home")
    assert_response :unprocessable_content
    [nil, 123, "x" * 32_769].each do |ticket|
      execute(ticket)
      assert_response :unprocessable_content
    end
  end

  def test_changed_command_or_authorization_invalidates_pending_work
    pending = submit(command: "grant")
    @config.commands.fetch("grant").arguments.clear
    submit(transcript: "42", continuation: pending.fetch("continuation"))
    assert_response :unprocessable_content
    assert_includes response.parsed_body.fetch("message"), "command changed"

    allowed = true
    @config.command :protected, description: "Protected", authorize: ->(_args, _context) { allowed } do
      execute { VoiceControl::Result.message("Should not run") }
    end
    pending = submit(command: "protected")
    allowed = false
    execute(pending.fetch("ticket"))
    assert_response :forbidden
  end

  def test_ambiguity_rejects_unknown_answers_and_ignores_removed_candidates
    @config.interpreter = ->(**_args) { { command: "home", confidence: 0.1, candidates: %w[home grant] } }
    pending = submit(transcript: "maybe home")
    @config.commands.delete("grant")
    again = submit(transcript: "nonsense", continuation: pending.fetch("continuation"))
    assert_equal "ambiguous", again["kind"]
    assert_equal ["home"], again.fetch("candidates").map { |candidate| candidate.fetch("key") }
    pending = submit(transcript: "1", continuation: again.fetch("continuation"))
    assert_equal "/", execute(pending.fetch("ticket"))["url"]
    @config.interpreter = ->(**_args) { { command: "home", confidence: 0.1, candidates: ["unknown"] } }
    submit(transcript: "maybe")
    assert_response :unprocessable_content
  end

  def test_invalid_results_and_failed_error_reporters_still_return_generic_errors
    @config.command :invalid, description: "Invalid result" do
      execute { |_args, _context| { kind: "eval", code: "private data" } }
    end
    @config.on_error = ->(_error, _details) { raise "reporting secret" }
    pending = submit(command: "invalid")
    execute(pending.fetch("ticket"))
    assert_response :internal_server_error
    assert_equal "Something went wrong. Check the result before trying again.", response.parsed_body.fetch("message")
    refute_includes response.body, "secret"
  end

  def test_browser_manifest_validates_references_labels_and_control_types
    target = { "ref" => "e1", "label" => "Control", "id" => "", "name" => "", "tag" => "textarea", "type" => "" }
    build = ->(control) { VoiceControl::BrowserActions.new("page_id" => "page-1", "elements" => [control]) }
    assert_includes build.call(target).commands.map(&:key), "voice_control_browser_fill_e1"
    assert_includes build.call(target.merge("tag" => "input", "type" => "submit")).commands.map(&:key), "voice_control_browser_click_e1"
    assert_includes build.call(target.merge("tag" => "div", "type" => "button")).commands.map(&:key), "voice_control_browser_click_e1"
    [target.merge("ref" => "bad"), target.merge("label" => ""), target.merge("label" => "x" * 161), target.merge("tag" => "div"), nil].each do |control|
      assert_raises(VoiceControl::InvalidInput) { build.call(control) }
    end
    assert_nil build.call(target).snapshot(["home"])
    assert_nil VoiceControl::BrowserActions.select_value("select Plan", label: "Plan")
  end

  def test_jev_callable_credentials_invalid_answers_and_response_limits
    @config.api_key = -> { "callable-key" }
    jev = -> { VoiceControl::Jev.new.call(transcript: "home", context: {}, commands: @config.commands.values) }
    stub_request(:post, VoiceControl::Jev::ENDPOINT).with(headers: { "Authorization" => "Bearer callable-key" })
      .to_return(status: 200, body: "x" * 1_000_001)
    assert_raises(VoiceControl::ProviderError) { jev.call }
    ["wrong", -1, 2].each do |confidence|
      stub_request(:post, VoiceControl::Jev::ENDPOINT).to_return(status: 200, body: { answers: { action: { choice: "home", confidence: confidence, probabilities: {} } } }.to_json)
      assert_raises(VoiceControl::ProviderError) { jev.call }
    end
    @config.debug = true
    stub_request(:post, VoiceControl::Jev::ENDPOINT).to_return(status: 200, body: { answers: { action: { choice: "private-unknown", confidence: 0.5, probabilities: { home: 0.5 } } } }.to_json)
    result = jev.call
    assert_nil result.dig(:jev_result, :choice)
  end

  def test_assets_support_conditional_get_and_development_cache_expiry
    get "/voice_control/widget.js"
    etag = response.headers.fetch("ETag")
    get "/voice_control/widget.js", headers: { "If-None-Match" => etag }
    assert_response :not_modified
    original = Rails.env
    Rails.env = "development"
    get "/voice_control/widget.css"
    assert_response :success
    assert_includes response.headers.fetch("Cache-Control"), "max-age=0"
  ensure
    Rails.env = original if original
  end
end

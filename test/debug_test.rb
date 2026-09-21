require_relative "test_helper"

class DebugTest < VoiceControlTest
  def test_debug_is_disabled_by_default_even_when_requested_by_client
    refute @config.debug
    result = submit(transcript: "open home", debug: true)
    refute result.key?("debug")
    refute execute(result["ticket"]).key?("debug")
    get "/"
    assert_select 'voice-control-widget[data-debug="false"]'
  end

  def test_debug_reports_matching_and_execution_without_secrets
    @config.debug = true
    @config.api_key = "private-api-key"
    result = submit(transcript: "open home", context: { secret: "private-context" })
    details = result.fetch("debug")
    assert_equal "home", details["matched_command"]
    assert_equal "home", details["command"]
    assert_equal 1.0, details["confidence"]
    assert_equal 0.35, details["threshold"]
    assert_equal 2, details["command_count"]
    assert_operator details["duration_ms"], :>=, 0
    refute_match(/private-|ticket|context/, details.to_json)
    execution = execute(result["ticket"])
    assert_equal "execute", execution.dig("debug", "stage")
    assert_equal "navigate", execution.dig("debug", "outcome")
    get "/"
    assert_select 'voice-control-widget[data-debug="true"]'
  end

  def test_debug_explains_no_match_and_low_confidence
    @config.debug = true
    @config.interpreter = ->(**_args) { { command: nil, confidence: 0.1, candidates: [] } }
    result = submit(transcript: "unknown")
    assert_response :unprocessable_content
    assert_equal 0.1, result.dig("debug", "confidence")
    assert_equal "error", result.dig("debug", "outcome")
    assert_match(/No matching command/, result.dig("debug", "message"))
    @config.interpreter = ->(**_args) { { command: "home", confidence: 0.2, candidates: ["home", "secret_command"] } }
    result = submit(transcript: "maybe home")
    assert_equal "ambiguous", result.dig("debug", "outcome")
    assert_equal ["home"], result.dig("debug", "candidates")
  end

  def test_debug_does_not_expose_internal_errors_or_bypass_access
    @config.debug = true
    @config.on_error = ->(*) {}
    @config.interpreter = ->(**_args) { raise "private provider response" }
    result = submit(transcript: "open home")
    assert_response :internal_server_error
    refute_includes result.to_json, "private provider response"
    @config.authorize = -> { false }
    result = submit(transcript: "open home")
    assert_response :forbidden
    refute result.key?("debug")
  end

  def test_jev_answer_is_inspectable_only_in_debug_and_excludes_unexpected_fields
    @config.interpreter = VoiceControl::Jev.new
    @config.api_key = "private-api-key"
    answer = { choice: "home", confidence: 0.4, probabilities: { home: 0.4, none: 0.6, unknown: 0.9 }, extra: "private-provider-metadata" }
    stub_request(:post, VoiceControl::Jev::ENDPOINT).to_return(status: 200, body: { answers: { action: answer }, request: "private-context" }.to_json)
    result = submit(transcript: "take me home")
    refute result.key?("debug")
    @config.debug = true
    result = submit(transcript: "take me home")
    details = result.fetch("debug")
    assert_equal "jev", details["selection_source"]
    assert_equal({ "choice" => "home", "confidence" => 0.4, "probabilities" => { "home" => 0.4, "none" => 0.6 } }, details["jev_result"])
    assert_equal({ "home" => "Open home" }, details["command_labels"])
    assert_equal "home", details.fetch("candidate_details").first["command"]
    assert_equal 0.4, details.fetch("candidate_details").first["probability"]
    assert details.fetch("candidate_details").first["description"].present?
    refute_match(/private-|unknown/, details.to_json)
    answer[:choice] = "none"
    stub_request(:post, VoiceControl::Jev::ENDPOINT).to_return(status: 200, body: { answers: { action: answer } }.to_json)
    result = submit(transcript: "something else")
    assert_response :unprocessable_content
    assert_equal "none", result.dig("debug", "jev_result", "choice")
  end
end

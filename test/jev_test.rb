require_relative "test_helper"

class JevTest < VoiceControlTest
  def test_documented_request_and_response_contract
    @config.api_key = "test-key"
    stub = stub_request(:post, "https://api.typesafe.ai/v1/systemone")
      .with(headers: { "Authorization" => "Bearer test-key" }, body: lambda { |body|
        json = JSON.parse(body)
        json["questions"]["action"]["type"] == "choice" && json["questions"]["action"]["criteria"].key?("home") && json["model"] == "jev-latest"
      }).to_return(status: 200, body: { answers: { action: { choice: "home", confidence: 0.9, probabilities: { home: 0.95, none: 0.05 } } } }.to_json)
    result = VoiceControl::Jev.new.call(transcript: "take me home", context: { path: "/users" }, commands: @config.commands.values)
    assert_equal "home", result[:command]
    assert_requested stub
  end

  def test_missing_credentials_timeout_http_and_malformed_responses
    assert_raises(VoiceControl::ProviderError) { call_jev }
    @config.api_key = "test-key"
    stub_request(:post, VoiceControl::Jev::ENDPOINT).to_timeout
    assert_raises(VoiceControl::ProviderError) { call_jev }
    stub_request(:post, VoiceControl::Jev::ENDPOINT).to_return(status: 401)
    assert_raises(VoiceControl::ProviderError) { call_jev }
    stub_request(:post, VoiceControl::Jev::ENDPOINT).to_return(status: 200, body: "not json")
    assert_raises(VoiceControl::ProviderError) { call_jev }
    stub_request(:post, VoiceControl::Jev::ENDPOINT).to_return(status: 200, body: '{"answers":{}}')
    assert_raises(VoiceControl::ProviderError) { call_jev }
  end

  def test_longest_commands_are_skipped_beyond_the_jev_choice_limit
    original_logger = Rails.logger
    @config.api_key = "test-key"
    @config.debug = true
    extra = (1..260).map do |index|
      VoiceControl::Command.new("extra_#{index}", description: "Extra #{'x' * index}", group: "Extra") { execute { |_args, _context| nil } }
    end
    sent = nil
    stub_request(:post, VoiceControl::Jev::ENDPOINT).with(body: lambda { |body|
      sent = JSON.parse(body).dig("questions", "action", "criteria").keys
    }).to_return(status: 200, body: { answers: { action: { choice: "extra_260", confidence: 0.9, probabilities: { extra_260: 0.9, home: 0.1 } } } }.to_json)
    log = StringIO.new
    Rails.logger = Logger.new(log)
    result = VoiceControl::Jev.new.call(transcript: "home", context: {}, commands: @config.commands.values + extra)
    assert_equal 255, sent.length
    assert_includes sent, "none"
    assert_includes sent, "home"
    assert_includes sent, "extra_252"
    refute_includes sent, "extra_253"
    assert_nil result[:command]
    assert_equal ["home"], result[:candidates]
    assert_equal 8, result.dig(:jev_result, :skipped_commands)
    assert_match(/skipped the 8 longest, starting with: extra_260/, log.string)
  ensure
    Rails.logger = original_logger
  end

  def test_page_url_reaches_jev_through_the_backend
    @config.api_key = "test-key"
    @config.interpreter = VoiceControl::Jev.new
    context = { "url" => "https://example.com/users/42/edit?tab=balance#tokens", "path" => "/users/42/edit", "area" => "admin" }
    stub = stub_request(:post, VoiceControl::Jev::ENDPOINT).with(body: lambda { |body|
      JSON.parse(JSON.parse(body).fetch("state")).fetch("context") == context
    }).to_return(status: 200, body: { answers: { action: { choice: "home", confidence: 1.0, probabilities: { home: 1.0 } } } }.to_json)
    result = submit(transcript: "open home", context: context)
    assert_equal "execute", result["kind"]
    assert_equal "/", execute(result["ticket"])["url"]
    assert_requested stub
  end

  private

  def call_jev
    VoiceControl::Jev.new.call(transcript: "home", context: {}, commands: @config.commands.values)
  end
end

require_relative "test_helper"

class JevTest < LazzzyTest
  def test_documented_request_and_response_contract
    @config.api_key = "test-key"
    stub = stub_request(:post, "https://api.typesafe.ai/v1/systemone")
      .with(headers: { "Authorization" => "Bearer test-key" }, body: lambda { |body|
        json = JSON.parse(body)
        json["questions"]["action"]["type"] == "choice" && json["questions"]["action"]["criteria"].key?("home") && json["model"] == "jev-latest"
      }).to_return(status: 200, body: { answers: { action: { choice: "home", confidence: 0.9, probabilities: { home: 0.95, none: 0.05 } } } }.to_json)
    result = Lazzzy::Jev.new.call(transcript: "take me home", context: { path: "/users" }, commands: @config.commands.values)
    assert_equal "home", result[:command]
    assert_requested stub
  end

  def test_missing_credentials_timeout_http_and_malformed_responses
    assert_raises(Lazzzy::ProviderError) { call_jev }
    @config.api_key = "test-key"
    stub_request(:post, Lazzzy::Jev::ENDPOINT).to_timeout
    assert_raises(Lazzzy::ProviderError) { call_jev }
    stub_request(:post, Lazzzy::Jev::ENDPOINT).to_return(status: 401)
    assert_raises(Lazzzy::ProviderError) { call_jev }
    stub_request(:post, Lazzzy::Jev::ENDPOINT).to_return(status: 200, body: "not json")
    assert_raises(Lazzzy::ProviderError) { call_jev }
    stub_request(:post, Lazzzy::Jev::ENDPOINT).to_return(status: 200, body: '{"answers":{}}')
    assert_raises(Lazzzy::ProviderError) { call_jev }
  end

  def test_page_url_reaches_jev_through_the_backend
    @config.api_key = "test-key"
    @config.interpreter = Lazzzy::Jev.new
    context = { "url" => "https://example.com/users/42/edit?tab=balance#tokens", "path" => "/users/42/edit", "area" => "admin" }
    stub = stub_request(:post, Lazzzy::Jev::ENDPOINT).with(body: lambda { |body|
      JSON.parse(JSON.parse(body).fetch("state")).fetch("context") == context
    }).to_return(status: 200, body: { answers: { action: { choice: "home", confidence: 1.0, probabilities: { home: 1.0 } } } }.to_json)
    result = submit(transcript: "open home", context: context)
    assert_equal "execute", result["kind"]
    assert_equal "/", execute(result["ticket"])["url"]
    assert_requested stub
  end

  private

  def call_jev
    Lazzzy::Jev.new.call(transcript: "home", context: {}, commands: @config.commands.values)
  end
end

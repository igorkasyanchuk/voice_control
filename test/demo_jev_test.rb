require_relative "test_helper"

class DemoJevTest < LazzzyTest
  def test_demo_labels_the_active_interpreter_without_exposing_credentials
    get "/"
    assert_select ".demo-details strong", text: "Local demo interpreter"

    @config.api_key = "private-demo-key"
    @config.interpreter = Lazzzy::Jev.new
    get "/"
    assert_select ".demo-details strong", text: "Jev interpreter"
    refute_includes response.body, "private-demo-key"
    refute_includes response.body, "No API key."
  end

  def test_free_form_command_uses_jev_and_executes_navigation
    @config.api_key = "private-demo-key"
    @config.interpreter = Lazzzy::Jev.new
    request = stub_request(:post, Lazzzy::Jev::ENDPOINT)
      .with(headers: { "Authorization" => "Bearer private-demo-key" }, body: lambda { |body|
        state = JSON.parse(JSON.parse(body).fetch("state"))
        state["transcript"] == "take me back to the home page" && state["context"]["path"] == "/reports"
      }).to_return(status: 200, body: { answers: { action: { choice: "home", confidence: 1.0, probabilities: { home: 1.0 } } } }.to_json)

    result = submit(transcript: "take me back to the home page", context: { path: "/reports" })
    assert_equal "execute", result["kind"]
    assert_equal "/", execute(result["ticket"])["url"]
    assert_requested request, times: 1
  end

  def test_jev_failure_does_not_silently_fall_back_to_local_matching
    @config.api_key = "private-demo-key"
    @config.interpreter = Lazzzy::Jev.new
    stub_request(:post, Lazzzy::Jev::ENDPOINT).to_return(status: 401)

    result = submit(transcript: "open home")
    assert_response :internal_server_error
    assert_equal "error", result["kind"]
    refute result.key?("ticket")
  end
end

require_relative "test_helper"

class DemoAccountTest < ActionDispatch::IntegrationTest
  def setup
    get "/"
    csrf = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
    @headers = { "X-CSRF-Token" => csrf }
  end

  def test_current_plan_is_visible_in_the_account_and_metric
    assert_select ".account [data-demo-plan]", text: "Free"
    assert_select "#demo-plan[data-demo-plan]", text: "Free"
    assert_select ".metrics article span", text: "Your plan"
  end

  def test_account_commands_extract_each_supported_plan
    { "change my plan to premium" => "premium", "set my plan to premium plus" => "premium_plus", "change my plan to free" => "free" }.each do |transcript, plan|
      result = interpret(transcript)
      assert_equal "execute", result["kind"], transcript
      post "/voice_control/execute", params: { ticket: result["ticket"] }, as: :json, headers: @headers
      assert_response :success
      assert_equal({ "kind" => "event", "name" => "demo:plan", "detail" => { "plan" => plan } }, response.parsed_body)
      assert_equal plan, DemoUser.find(1).plan
      get "/"
      assert_select ".account [data-demo-plan]", text: DemoUser::PLANS.key(plan)
    end
  end

  def test_missing_or_unknown_plan_asks_for_a_valid_choice
    result = interpret("change my plan")
    assert_equal "question", result["kind"]
    result = interpret("enterprise", continuation: result["continuation"])
    assert_equal "question", result["kind"]
    result = interpret("premium plus", continuation: result["continuation"])
    assert_equal "execute", result["kind"]
  end

  def test_token_grants_persist_and_cannot_be_replayed
    result = interpret("give user 42 100 tokens")
    assert_equal 1200, DemoUser.find(42).token_balance
    post "/voice_control/execute", params: { ticket: result["ticket"] }, as: :json, headers: @headers
    assert_response :success
    assert_equal 1300, response.parsed_body.dig("detail", "balance")
    assert_equal 100, response.parsed_body.dig("detail", "total")
    assert_equal 1300, DemoUser.find(42).token_balance
    assert_equal 100, DemoSetting.find(1).tokens_granted
    post "/voice_control/execute", params: { ticket: result["ticket"] }, as: :json, headers: @headers
    assert_response :unprocessable_content
    assert_equal 1300, DemoUser.find(42).token_balance
    get "/users"
    assert_select "#demo-token-balance-42", text: "1,300 tokens"
    assert_select ".metrics", count: 0
    get "/"
    assert_select "#demo-token-count", text: "100"
  end

  def test_grants_to_deleted_users_fail_without_changing_totals
    result = interpret("give user 42 100 tokens")
    DemoUser.find(42).destroy!
    post "/voice_control/execute", params: { ticket: result["ticket"] }, as: :json, headers: @headers
    assert_response :unprocessable_content
    assert_equal "That demo user does not exist.", response.parsed_body["message"]
    assert_equal 0, DemoSetting.find(1).tokens_granted
  end

  def test_workspace_commands_persist_settings
    { "discount" => ["12.5", :discount_percent, BigDecimal("12.5")], "notifications" => ["no", :notifications, false] }.each do |command, (answer, attribute, expected)|
      post "/voice_control/interpret", params: { command: command, context: {} }, as: :json, headers: @headers
      result = interpret(answer, continuation: response.parsed_body.fetch("continuation"))
      post "/voice_control/execute", params: { ticket: result["ticket"] }, as: :json, headers: @headers
      assert_response :success
      assert_equal expected, DemoSetting.find(1).public_send(attribute)
    end
  end

  def test_workspace_summary_is_scoped_and_notifies_without_navigation
    post "/voice_control/interpret", params: { command: "workspace_summary", context: { path: "/" } }, as: :json, headers: @headers
    assert_response :forbidden
    result = interpret("summarize workspace", context: { path: "/settings" })
    post "/voice_control/execute", params: { ticket: result.fetch("ticket") }, as: :json, headers: @headers
    assert_response :success
    assert_equal "message", response.parsed_body.fetch("kind")
    assert_includes response.parsed_body.fetch("message"), DemoSetting.find(1).workspace_name
    assert_equal "Workspace details ready.", response.parsed_body.fetch("notification")
  end

  private

  def interpret(transcript, **options)
    post "/voice_control/interpret", params: { transcript: transcript, context: {}, **options }, as: :json, headers: @headers
    assert_response :success
    response.parsed_body
  end
end

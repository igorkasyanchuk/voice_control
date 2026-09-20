require_relative "test_helper"

class DemoCrudTest < ActionDispatch::IntegrationTest
  def setup
    get "/"
    @headers = { "X-CSRF-Token" => Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"] }
  end

  def test_create_edit_and_delete_a_user
    get "/users/new"
    assert_response :success
    assert_select 'form[action="/users"] input[name="user[name]"]'

    assert_difference "DemoUser.count", 1 do
      post "/users", params: { user: { name: " Casey Jones ", email: " CASEY@example.com ", plan: "premium", token_balance: 250, status: "active" } }, headers: @headers
    end
    user = DemoUser.find_by!(email: "casey@example.com")
    assert_equal "Casey Jones", user.name
    assert_redirected_to "/users/#{user.id}"
    follow_redirect!
    assert_select "h1", text: "Casey Jones"
    assert_select "#demo-token-balance-#{user.id}", text: "250 tokens"

    get "/users/#{user.id}/edit"
    assert_select 'input[name="user[email]"][value="casey@example.com"]'
    patch "/users/#{user.id}", params: { user: { name: "Casey Smith", token_balance: 500, plan: "premium_plus", status: "inactive" } }, headers: @headers
    assert_response :see_other
    assert_equal ["Casey Smith", 500, "premium_plus", "inactive"], user.reload.values_at(:name, :token_balance, :plan, :status)
    get "/users"
    assert_select "td", text: "Casey Smithcasey@example.com"
    assert_select "#demo-token-balance-#{user.id}", text: "500 tokens"

    assert_difference "DemoUser.count", -1 do
      delete "/users/#{user.id}", headers: @headers
    end
    assert_redirected_to "/users"
    refute DemoUser.exists?(user.id)
  end

  def test_user_validation_preserves_the_record_and_displays_errors
    [{ name: " " }, { email: "not-an-email" }, { email: " ALEX@example.com " }, { token_balance: -1 }, { token_balance: "1.5" }, { plan: "enterprise" }, { status: "unknown" }].each do |attributes|
      patch "/users/73", params: { user: attributes }, headers: @headers
      assert_response :unprocessable_content
      assert_select '[role="alert"] li'
      assert_equal ["Sam Rivera", "sam@example.com", 50, "free", "active"], DemoUser.find(73).values_at(:name, :email, :token_balance, :plan, :status)
    end
    assert_no_difference "DemoUser.count" do
      post "/users", params: { user: { name: "", email: "" } }, headers: @headers
    end
    assert_response :unprocessable_content
  end

  def test_users_are_paginated
    21.times { |index| DemoUser.create!(name: "Person #{index}", email: "person#{index}@example.com") }
    get "/users"
    assert_select "tbody tr", count: 20
    assert_select 'a[href="/users?number=2"]', text: "Next"
    get "/users", params: { number: 2 }
    assert_select "tbody tr", count: 5
  end

  def test_settings_save_and_render_from_the_database
    patch "/settings", params: { settings: { workspace_name: "Studio North", workspace_note: "A saved note <script>alert(1)</script>", notifications: "0", discount_percent: "12.50", tokens_granted: 999 } }, headers: @headers
    assert_redirected_to "/settings"
    settings = DemoSetting.find(1)
    assert_equal "Studio North", settings.workspace_name
    assert_equal "12.5", settings.discount_percent.to_s("F")
    refute settings.notifications
    assert_equal 0, settings.tokens_granted
    follow_redirect!
    assert_select '[role="status"]', text: "Settings saved."
    assert_select '#workspace-name[value="Studio North"]'
    assert_select "#workspace-note", text: "A saved note <script>alert(1)</script>"
    assert_select "textarea script", count: 0
    assert_select 'input[name="settings[notifications]"][checked]', count: 0
    get "/"
    assert_select ".workspace", text: /Studio North/
  end

  def test_invalid_settings_keep_saved_values
    [{ workspace_name: " " }, { workspace_name: "a" * 101 }, { workspace_note: "a" * 2001 }, { discount_percent: 101 }, { discount_percent: -1 }].each do |attributes|
      patch "/settings", params: { settings: attributes }, headers: @headers
      assert_response :unprocessable_content
      assert_select '[role="alert"] li'
      assert_equal "Fern & Co.", DemoSetting.find(1).workspace_name
      assert_equal 0, DemoSetting.find(1).discount_percent
    end
  end

  def test_guests_cannot_access_or_mutate_users_and_settings
    headers = @headers.merge("X-Demo-Role" => "guest")
    get "/users", headers: headers
    assert_response :forbidden
    get "/users/42/edit", headers: headers
    assert_response :forbidden
    get "/settings", headers: headers
    assert_response :forbidden
    assert_no_difference "DemoUser.count" do
      post "/users", params: { user: { name: "Guest", email: "guest@example.com" } }, headers: headers
      assert_response :forbidden
      delete "/users/42", headers: headers
      assert_response :forbidden
    end
    patch "/users/42", params: { user: { token_balance: 0 } }, headers: headers
    assert_response :forbidden
    assert_equal 1200, DemoUser.find(42).token_balance
    patch "/settings", params: { settings: { workspace_name: "Changed" } }, headers: headers
    assert_response :forbidden
    assert_equal "Fern & Co.", DemoSetting.find(1).workspace_name
  end

  def test_mutations_require_csrf_and_the_demo_administrator_cannot_be_deleted
    assert_raises(ActionController::InvalidAuthenticityToken) { delete "/users/42" }
    assert_raises(ActionController::InvalidAuthenticityToken) { patch "/settings", params: { settings: { workspace_name: "Changed" } } }
    assert_no_difference "DemoUser.count" do
      delete "/users/1", headers: @headers
    end
    assert_redirected_to "/users/1"
    follow_redirect!
    assert_select '[role="status"]', text: "The demo administrator cannot be deleted."
  end
end

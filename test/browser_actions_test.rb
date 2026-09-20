require_relative "test_helper"

class BrowserActionsTest < LazzzyTest
  def test_fill_asks_for_a_value_then_returns_a_browser_action
    @config.command :workspace_name, description: "Fill workspace name" do
      argument :value, :string
      execute { |args, _context| Lazzzy::Result.fill("#workspace-name", args[:value]) }
    end

    result = submit(command: "workspace_name")
    assert_equal "question", result["kind"]
    result = submit(transcript: "Studio North", continuation: result["continuation"])
    assert_equal "execute", result["kind"]
    assert_equal({ "kind" => "browser", "action" => "fill", "selector" => "#workspace-name", "value" => "Studio North" }, execute(result["ticket"]))
    execute(result["ticket"])
    assert_response :unprocessable_content
  end

  def test_click_and_focus_use_the_authorized_execution_flow
    [:click, :focus].each do |action|
      @config.command action, description: action.to_s do
        execute { |_args, _context| Lazzzy::Result.public_send(action, "#target") }
      end
      result = submit(command: action.to_s)
      assert_equal({ "kind" => "browser", "action" => action.to_s, "selector" => "#target" }, execute(result["ticket"]))
      result = submit(command: action.to_s)
      execute(result["ticket"], headers: { "X-Demo-Role" => "guest" })
      assert_response :forbidden
    end
  end

  def test_settings_renders_labeled_fields_and_a_save_button
    get "/settings"
    assert_select 'label[for="workspace-name"]', text: "Workspace name"
    assert_select 'input#workspace-name[value="Fern & Co."]'
    assert_select 'label[for="workspace-note"]', text: "Workspace note"
    assert_select "textarea#workspace-note"
    assert_select 'button#save-settings[type="submit"]'
  end

  def test_browser_results_reject_invalid_selectors_and_oversized_values
    [nil, "", "  ", "a" * 501].each do |selector|
      [:click, :focus].each do |action|
        assert_raises(Lazzzy::InvalidInput) { Lazzzy::Result.public_send(action, selector) }
      end
      assert_raises(Lazzzy::InvalidInput) { Lazzzy::Result.fill(selector, "test") }
    end
    assert_raises(Lazzzy::InvalidInput) { Lazzzy::Result.fill("#name", "a" * 2001) }
    assert_equal "", Lazzzy::Result.fill("#name", "")[:value]
  end
end

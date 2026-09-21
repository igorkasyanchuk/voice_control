require_relative "test_helper"

class DynamicBrowserActionsTest < VoiceControlTest
  def setup
    super
    @config.browser_actions = true
    @page = { page_id: "page-123", elements: [
      { ref: "e1", label: "Save changes", id: "save", name: "", tag: "button", type: "" },
      { ref: "e2", label: "Display name", id: "", name: "display_name", tag: "input", type: "text" },
    ] }
  end

  def test_jev_selects_discovered_controls_without_registered_commands
    @config.interpreter = VoiceControl::Jev.new
    @config.api_key = "test-key"
    @page[:elements][1][:value] = "PRIVATE FIELD VALUE"
    request = stub_request(:post, VoiceControl::Jev::ENDPOINT).with(body: lambda { |body|
      criteria = JSON.parse(body).dig("questions", "action", "criteria")
      criteria["voice_control_browser_click_e1"].include?("Save changes") &&
        criteria["voice_control_browser_fill_e2"].include?("Display name") &&
        criteria["voice_control_browser_fill_e2"].include?("enter Display name") &&
        !body.include?("PRIVATE FIELD VALUE")
    }).to_return(status: 200, body: { answers: { action: {
      choice: "voice_control_browser_click_e1", confidence: 1.0, probabilities: { voice_control_browser_click_e1: 1.0 },
    } } }.to_json)
    result = submit(transcript: "press the save button", browser_page: @page)
    assert_equal "execute", result["kind"]
    assert_equal({ "kind" => "browser", "action" => "click", "target" => "e1", "page_id" => "page-123" }, execute(result["ticket"]))
    assert_requested request
    refute @config.commands.key?("voice_control_browser_click_e1")
  end

  def test_idless_field_followup_keeps_the_original_target
    result = submit(transcript: "fill Display name", browser_page: @page)
    assert_equal "question", result["kind"]
    result = submit(transcript: "Alex", continuation: result["continuation"], browser_page: { bad: "replacement" })
    assert_equal "execute", result["kind"]
    assert_equal({ "kind" => "browser", "action" => "fill", "target" => "e2", "page_id" => "page-123", "value" => "Alex" }, execute(result["ticket"]))
    execute(result["ticket"])
    assert_response :unprocessable_content
  end

  def test_inline_text_patterns
    ['fill Display name with "Studio North"', "fill Display name with Studio North", "type Studio North into Display name"].each do |text|
      result = submit(transcript: text, command: "voice_control_browser_fill_e2", browser_page: @page)
      assert_equal "execute", result["kind"]
      assert_equal "Studio North", execute(result["ticket"])["value"]
    end
  end

  def test_exact_browser_click_does_not_run_an_unrelated_interpreter_match
    @config.debug = true
    @page[:elements][0][:label] = "Performance"
    @config.interpreter = ->(**_args) { flunk "Exact clicks must not ask the interpreter to guess" }
    result = submit(transcript: "  CLICK   Performance  ", browser_page: @page)
    assert_equal "exact_browser_label", result.dig("debug", "selection_source")
    refute result.fetch("debug").key?("jev_result")
    assert_equal "Click Performance (button, id: save)", result.dig("debug", "matched_description")
    assert_equal "e1", execute(result["ticket"])["target"]
  end

  def test_duplicate_exact_browser_labels_require_disambiguation
    @page[:elements] = %w[e1 e2].map { |ref| { ref: ref, label: "Performance", id: "", name: "", tag: "a", type: "" } }
    @config.interpreter = ->(**_args) { flunk "Duplicate exact clicks must not be guessed" }
    result = submit(transcript: "click performance", browser_page: @page)
    assert_equal "ambiguous", result["kind"]
    assert_equal %w[voice_control_browser_click_e1 voice_control_browser_click_e2], result["candidates"].map { |candidate| candidate["key"] }
    result = submit(transcript: "two", continuation: result["continuation"])
    assert_equal "e2", execute(result["ticket"])["target"]
  end

  def test_browser_history_commands_use_signed_snapshots_and_reject_replay
    ["back", "forward"].each do |direction|
      result = submit(transcript: "go #{direction}", browser_page: @page.merge(elements: []))
      assert_equal "execute", result["kind"]
      assert_equal({ "kind" => "browser", "action" => "history", "direction" => direction, "page_id" => "page-123" }, execute(result["ticket"]))
      execute(result["ticket"])
      assert_response :unprocessable_content
    end
    result = submit(transcript: "go back", browser_page: @page)
    execute(result["ticket"], headers: { "X-Demo-Role" => "guest" })
    assert_response :forbidden
    @config.browser_actions = false
    execute(result["ticket"])
    assert_response :forbidden
  end

  def test_submit_uses_a_signed_page_command_without_sending_form_values
    ["submit", "submit form", "submit this form"].each do |phrase|
      result = submit(transcript: phrase, browser_page: @page.merge(elements: []))
      assert_equal "execute", result["kind"]
      assert_equal({ "kind" => "browser", "action" => "submit", "page_id" => "page-123" }, execute(result["ticket"]))
      execute(result["ticket"])
      assert_response :unprocessable_content
    end
    result = submit(transcript: "submit", browser_page: @page)
    execute(result["ticket"], headers: { "X-Demo-Role" => "guest" })
    assert_response :forbidden
    @config.browser_actions = false
    execute(result["ticket"])
    assert_response :forbidden
    submit(command: "voice_control_browser_submit", browser_page: @page)
    assert_response :forbidden
  end

  def test_date_and_time_fields_use_dynamic_fill_clear_and_selected_entry
    @page[:elements] = [
      { ref: "e1", label: "Due date", id: "due-date", name: "due_date", tag: "input", type: "date" },
      { ref: "e2", label: "Start time", id: "start-time", name: "start_time", tag: "input", type: "time" },
    ]
    { "set Due date to October 1" => ["e1", "October 1"], "set Start time to 14:30" => ["e2", "14:30"] }.each do |phrase, (target, value)|
      result = submit(transcript: phrase, browser_page: @page)
      assert_equal({ "kind" => "browser", "action" => "fill", "target" => target, "page_id" => "page-123", "value" => value }, execute(result["ticket"]))
    end
    result = submit(transcript: "enter 2:30 PM", browser_page: @page.merge(selected_ref: "e2"))
    assert_equal "2:30 PM", execute(result["ticket"])["value"]
    result = submit(transcript: "clear Due date", browser_page: @page)
    assert_equal "clear", execute(result["ticket"])["action"]
  end

  def test_row_context_distinguishes_identical_actions
    @page[:elements] = [
      { ref: "e1", label: "Edit Alex Morgan", id: "", name: "", tag: "a", type: "" },
      { ref: "e2", label: "Edit Sam Rivera", id: "", name: "", tag: "a", type: "" },
    ]
    result = submit(transcript: "edit Alex Morgan", browser_page: @page)
    assert_equal "e1", execute(result["ticket"])["target"]
  end

  def test_clear_named_and_selected_fields_without_a_value
    result = submit(transcript: "clear Display name", browser_page: @page)
    assert_equal "execute", result["kind"]
    assert_equal({ "kind" => "browser", "action" => "clear", "target" => "e2", "page_id" => "page-123" }, execute(result["ticket"]))
    result = submit(transcript: "clear this field", browser_page: @page.merge(selected_ref: "e2"))
    assert_equal({ "kind" => "browser", "action" => "clear", "target" => "e2", "page_id" => "page-123", "selected" => true }, execute(result["ticket"]))
    submit(command: "voice_control_browser_clear_selected_e2", browser_page: @page)
    assert_response :forbidden
    submit(command: "voice_control_browser_clear_e1", browser_page: @page)
    assert_response :forbidden
  end

  def test_scrolling_uses_signed_page_snapshot_even_without_controls
    page = @page.merge(elements: [])
    { "scroll down" => "down", "scroll up" => "up", "back to top" => "top", "scroll to the bottom" => "bottom" }.each do |phrase, direction|
      result = submit(transcript: phrase, browser_page: page)
      assert_equal "execute", result["kind"]
      assert_equal({ "kind" => "browser", "action" => "scroll", "direction" => direction, "page_id" => "page-123" }, execute(result["ticket"]))
      execute(result["ticket"])
      assert_response :unprocessable_content
    end
    result = submit(transcript: "scroll down", browser_page: page)
    @config.browser_actions = false
    execute(result["ticket"])
    assert_response :forbidden
  end

  def test_section_scrolling_targets_a_discovered_heading
    @page[:elements] << { ref: "e3", label: "Billing", id: "", name: "", tag: "h2", type: "" }
    ["show the Billing section", "scroll to Billing"].each do |phrase|
      result = submit(transcript: phrase, browser_page: @page)
      assert_equal({ "kind" => "browser", "action" => "reveal", "target" => "e3", "page_id" => "page-123" }, execute(result["ticket"]))
    end
    submit(command: "voice_control_browser_click_e3", browser_page: @page)
    assert_response :forbidden
    submit(command: "voice_control_browser_reveal_e2", browser_page: @page)
    assert_response :forbidden
  end

  def test_checkbox_commands_set_an_explicit_state_with_synonyms
    @page[:elements] = [{ ref: "e1", label: "Enable notifications", id: "notifications", name: "notifications", tag: "input", type: "checkbox" }]
    { "check Enable notifications" => "check", "enable notifications" => "check", "turn on notifications" => "check",
      "uncheck Enable notifications" => "uncheck", "disable notifications" => "uncheck", "turn off notifications" => "uncheck" }.each do |phrase, action|
      result = submit(transcript: phrase, browser_page: @page)
      assert_equal "execute", result["kind"], phrase
      assert_equal({ "kind" => "browser", "action" => action, "target" => "e1", "page_id" => "page-123" }, execute(result["ticket"]))
    end
  end

  def test_radio_selection_and_unsupported_uncheck
    @page[:elements] = [{ ref: "e1", label: "Inactive", id: "inactive", name: "status", tag: "input", type: "radio" }]
    ["choose Inactive", "select Inactive", "check Inactive"].each do |phrase|
      result = submit(transcript: phrase, browser_page: @page)
      assert_equal "choose", execute(result["ticket"])["action"]
    end
    submit(command: "voice_control_browser_uncheck_e1", browser_page: @page)
    assert_response :forbidden
    get "/users/1/edit"
    assert_select 'fieldset input[type="radio"][name="user[status]"]', count: 2
    assert_select 'input[type="radio"][value="active"][checked]', count: 1
  end

  def test_entry_synonyms_select_the_same_field_without_a_command_key
    ["fill Display name with Studio North", "enter Display name with Studio North", "type Display name with Studio North", "set Display name to Studio North", "enter Studio North into Display name", "type Studio North in Display name"].each do |transcript|
      result = submit(transcript: transcript, browser_page: @page)
      assert_equal "execute", result["kind"], transcript
      assert_equal({ "kind" => "browser", "action" => "fill", "target" => "e2", "page_id" => "page-123", "value" => "Studio North" }, execute(result["ticket"]))
    end
  end

  def test_enter_without_a_value_asks_a_followup
    @page[:elements][1].merge!(label: "Token balance", type: "number")
    result = submit(transcript: "enter Token balance", browser_page: @page)
    assert_equal "question", result["kind"]
    result = submit(transcript: "500", continuation: result["continuation"])
    assert_equal "500", execute(result["ticket"])["value"]
  end

  def test_enter_preserves_prepositions_in_the_value
    { "enter Meeting with Sam into Display name" => "Meeting with Sam", "enter Display name with Walk into town" => "Walk into town" }.each do |transcript, value|
      result = submit(transcript: transcript, browser_page: @page)
      assert_equal "execute", result["kind"]
      assert_equal value, execute(result["ticket"])["value"]
    end
  end

  def test_enter_value_uses_the_selected_field_and_preserves_it_in_followups
    @page[:selected_ref] = "e2"
    result = submit(transcript: "enter Studio North", browser_page: @page)
    assert_equal "execute", result["kind"]
    assert_equal({ "kind" => "browser", "action" => "fill", "target" => "e2", "page_id" => "page-123", "selected" => true, "value" => "Studio North" }, execute(result["ticket"]))
    result = submit(transcript: "enter", browser_page: @page)
    assert_equal "question", result["kind"]
    result = submit(transcript: "Another name", continuation: result["continuation"])
    assert_equal "Another name", execute(result["ticket"])["value"]
    result = submit(transcript: 'type "Hello there"', browser_page: @page)
    assert_equal "Hello there", execute(result["ticket"])["value"]
    submit(transcript: "enterprise", browser_page: @page)
    assert_response :unprocessable_content
  end

  def test_selected_field_must_be_an_available_fill_target
    submit(command: "voice_control_browser_enter_e2", browser_page: @page)
    assert_response :forbidden
    %w[e1 e99].each do |ref|
      submit(command: "home", browser_page: @page.merge(selected_ref: ref))
      assert_response :unprocessable_content
    end
  end

  def test_dropdown_selects_only_an_available_option_and_supports_followups
    @page[:elements][1].merge!(tag: "select", type: "", label: "Plan", options: [{ ref: "o0", label: "Free" }, { ref: "o1", label: "Premium" }])
    ["set Plan to premium", "select Premium", "choose Premium from Plan"].each do |transcript|
      result = submit(transcript: transcript, browser_page: @page)
      assert_equal "execute", result["kind"], transcript
      assert_equal({ "kind" => "browser", "action" => "select", "target" => "e2", "page_id" => "page-123", "option" => "o1" }, execute(result["ticket"]))
    end
    result = submit(command: "voice_control_browser_select_e2", browser_page: @page)
    assert_equal "question", result["kind"]
    result = submit(transcript: "Enterprise", continuation: result["continuation"])
    assert_equal "question", result["kind"]
    result = submit(transcript: "Free", continuation: result["continuation"])
    assert_equal "o0", execute(result["ticket"])["option"]
    @page[:selected_ref] = "e2"
    result = submit(transcript: "enter Premium", browser_page: @page)
    assert_equal "o1", execute(result["ticket"])["option"]
  end

  def test_dropdown_rejects_invalid_and_ambiguous_option_catalogs
    @page[:elements][1].merge!(tag: "select", type: "")
    [nil, [], [{ ref: "o0", label: "Free" }, { ref: "o1", label: "free" }], [{ ref: "x", label: "Free" }], Array.new(101) { |i| { ref: "o#{i}", label: "Option #{i}" } }].each do |options|
      @page[:elements][1][:options] = options
      submit(command: "home", browser_page: @page)
      assert_response :unprocessable_content
    end
  end

  def test_low_confidence_selection_restores_dynamic_candidates
    @config.interpreter = ->(**_args) { { command: "voice_control_browser_click_e1", confidence: 0.1, candidates: %w[voice_control_browser_click_e1 voice_control_browser_focus_e2] } }
    result = submit(transcript: "use this control", browser_page: @page)
    assert_equal "ambiguous", result["kind"]
    assert_equal 2, result["candidates"].length
    result = submit(transcript: "two", continuation: result["continuation"])
    assert_equal "focus", execute(result["ticket"])["action"]
  end

  def test_numeric_fields_support_inline_values_followups_and_focus
    @page[:elements][1].merge!(label: "Token balance", type: "number")
    ["fill Token balance with 500", "enter 12.5 into Token balance", "set Token balance to -10"].zip(%w[500 12.5 -10]).each do |transcript, value|
      result = submit(transcript: transcript, command: "voice_control_browser_fill_e2", browser_page: @page)
      assert_equal "execute", result["kind"]
      assert_equal value, execute(result["ticket"])["value"]
    end
    result = submit(transcript: "fill Token balance", browser_page: @page)
    assert_equal "question", result["kind"]
    result = submit(transcript: "250", continuation: result["continuation"])
    assert_equal "250", execute(result["ticket"])["value"]
    result = submit(command: "voice_control_browser_focus_e2", browser_page: @page)
    assert_equal "focus", execute(result["ticket"])["action"]
  end

  def test_disabling_browser_actions_invalidates_outstanding_tickets
    result = submit(command: "voice_control_browser_click_e1", browser_page: @page)
    @config.browser_actions = false
    execute(result["ticket"])
    assert_response :forbidden
    submit(command: "voice_control_browser_click_e1", browser_page: @page)
    assert_response :forbidden
  end

  def test_browser_commands_require_access_and_the_matching_discovery
    submit(command: "voice_control_browser_click_e1", browser_page: @page, headers: { "X-Demo-Role" => "guest" })
    assert_response :forbidden
    submit(command: "voice_control_browser_click_e99", browser_page: @page)
    assert_response :forbidden
    submit(command: "voice_control_browser_click_e1")
    assert_response :forbidden
    result = submit(command: "voice_control_browser_click_e1", browser_page: @page)
    execute(result["ticket"], headers: { "X-Demo-Role" => "guest" })
    assert_response :forbidden
  end

  def test_manifest_limits_and_unsupported_inputs
    [[], { page_id: "bad", elements: Array.new(201) }, { page_id: "x" * 65, elements: [] }].each do |page|
      submit(transcript: "click save", browser_page: page)
      assert_response :unprocessable_content
    end
    @page[:elements][1][:type] = "password"
    submit(transcript: "click save", browser_page: @page)
    assert_response :unprocessable_content
    @page[:elements][1][:type] = "text"
    @page[:elements][1][:ref] = "e1"
    submit(transcript: "click save", browser_page: @page)
    assert_response :unprocessable_content
  end

  def test_ticket_does_not_carry_the_whole_page
    @page[:elements] = 200.times.map { |index| { ref: "e#{index}", label: "Button #{index}", id: "button#{index}", name: "", tag: "button", type: "" } }
    result = submit(command: "voice_control_browser_click_e199", browser_page: @page)
    assert_equal "execute", result["kind"]
    assert_operator result["ticket"].bytesize, :<, 4000
    assert_equal "e199", execute(result["ticket"])["target"]
  end

  def test_large_ambiguity_does_not_issue_an_unusable_continuation
    @page[:elements] = 3.times.map do |index|
      { ref: "e#{index}", label: "😀" * 160, id: "😀" * 160, name: "😀" * 160, tag: "select", type: "",
        options: 20.times.map { |option| { ref: "o#{option}", label: "#{option}" + "x" * 155 } } }
    end
    @config.interpreter = ->(**_args) {
      { command: "voice_control_browser_select_e0", confidence: 0.1,
      candidates: %w[voice_control_browser_select_e0 voice_control_browser_select_e1 voice_control_browser_select_e2] } }
    result = submit(transcript: "😀" * 2000, context: { note: "x" * 4000 }, browser_page: @page)
    assert_response :unprocessable_content
    assert_match(/too large/, result["message"])
    refute result.key?("continuation")
  end

  def test_dynamic_configuration_is_visible_to_the_widget
    get "/"
    assert_select 'voice-control-widget[data-browser-actions="true"]'
    @config.browser_actions = false
    get "/"
    assert_select 'voice-control-widget[data-browser-actions="false"]'
    assert_raises(ArgumentError) do
      @config.command("voice_control_browser_click_e1", description: "Collision") { execute { VoiceControl::Result.message("No") } }
    end
  end
end

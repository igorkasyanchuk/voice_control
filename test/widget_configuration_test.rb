require_relative "test_helper"

class WidgetConfigurationTest < VoiceControlTest
  def test_request_timeout_is_validated_and_rendered
    get "/"
    assert_select 'voice-control-widget[data-request-timeout="30000"]'
    @config.request_timeout = 1_000
    get "/"
    assert_select 'voice-control-widget[data-request-timeout="1000"]'
    [nil, "5000", 0, 999, 300_001, Float::INFINITY].each do |timeout|
      assert_raises(ArgumentError) { @config.request_timeout = timeout }
    end
  end

  def test_launcher_sizes_are_validated_and_rendered
    get "/"
    assert_select 'voice-control-widget[data-launcher-size="normal"]'
    @config.launcher_size = "small"
    assert_equal :small, @config.launcher_size
    get "/"
    assert_select 'voice-control-widget[data-launcher-size="small"]'
    [nil, :large, "44px"].each do |size|
      assert_raises(ArgumentError) { @config.launcher_size = size }
    end
    assert_equal :small, @config.launcher_size
  end

  def test_default_and_left_positions_and_hold_shortcut_are_rendered
    get "/"
    assert_select 'voice-control-widget[data-position="bottom_right"][data-push-to-talk-shortcut="mod+shift+space"]'
    @config.widget_position = "bottom_left"
    @config.push_to_talk_shortcut = "ctrl+shift+k"
    get "/"
    assert_select 'voice-control-widget[data-position="bottom_left"][data-push-to-talk-shortcut="ctrl+shift+k"]'
    @config.push_to_talk_shortcut = nil
    get "/"
    assert_select 'voice-control-widget[data-push-to-talk-shortcut]', count: 0
  end

  def test_invalid_widget_positions_are_rejected
    [nil, :top_left, "left; color: red"].each do |position|
      assert_raises(ArgumentError) { @config.widget_position = position }
    end
    assert_equal :bottom_right, @config.widget_position
  end

  def test_default_execution_cache_falls_back_only_in_development
    original_environment = Rails.env
    original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::NullStore.new
    Rails.env = "development"
    config = VoiceControl::Configuration.new
    first = config.execution_store.call
    assert_instance_of ActiveSupport::Cache::MemoryStore, first
    assert_same first, config.execution_store.call
    Rails.env = "production"
    assert_instance_of ActiveSupport::Cache::NullStore, VoiceControl::Configuration.new.execution_store.call
  ensure
    Rails.env = original_environment
    Rails.cache = original_cache
  end

  def test_demo_exposes_labeled_native_date_and_time_fields
    get "/orders"
    assert_select 'label[for="delivery-due-date"]', text: "Due date"
    assert_select 'input#delivery-due-date[type="date"]'
    assert_select 'label[for="delivery-start-time"]', text: "Start time"
    assert_select 'input#delivery-start-time[type="time"]'
  end
end

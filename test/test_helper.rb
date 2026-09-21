require "simplecov"
SimpleCov.start do
  enable_coverage :branch
  coverage_dir "coverage/ruby"
  cover "{lib,app,config}/**/*.rb"
  minimum_coverage line: 95.01, branch: 95.01
end

ENV["RAILS_ENV"] = "test"
require_relative "dummy/config/environment"
require "minitest/autorun"
require "rails/test_help"
require "webmock/minitest"
WebMock.disable_net_connect!(allow_localhost: true)

class ActionDispatch::IntegrationTest
  self.fixture_paths = [File.expand_path("fixtures", __dir__)]
  fixtures :demo_users, :demo_settings
end

class VoiceControlTest < ActionDispatch::IntegrationTest
  def setup
    WebMock.reset!
    @original_config = VoiceControl.configuration
    @config = VoiceControl::Configuration.new
    @config.authorize = -> { demo_admin? }
    @config.interpreter = DemoInterpreter.new
    @config.execution_store = -> { Rails.cache }
    VoiceControl.instance_variable_set(:@configuration, @config)
    Rails.cache.clear
    @events = []
    events = @events
    @config.group "Test commands" do
      @config.command :grant, description: "Give tokens", aliases: ["give"], examples: ["give tokens"] do
        argument :user_id, :integer, extract: ->(text, _context) { text[/user (\d+)/, 1] }, validate: ->(value) { value.positive? }
        argument :amount, :integer, extract: ->(text, _context) { text[/(\d+) tokens/, 1] }, validate: ->(value) { value.between?(1, 1000) }
        execute { |args, _context|
          events << args
          VoiceControl::Result.message("Granted #{args[:amount]} tokens") }
      end
      @config.command :home, description: "Open home", examples: ["open home"] do
        execute { |_args, _context| VoiceControl::Result.navigate("/") }
      end
    end
    get "/"
    @csrf = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
  end

  def teardown
    VoiceControl.instance_variable_set(:@configuration, @original_config)
  end

  def submit(headers: {}, **payload)
    post "/voice_control/interpret", params: { context: {}, **payload }, as: :json, headers: { "X-CSRF-Token" => @csrf, **headers }
    response.parsed_body
  end

  def execute(ticket, headers: {})
    post "/voice_control/execute", params: { ticket: ticket }, as: :json, headers: { "X-CSRF-Token" => @csrf, **headers }
    response.parsed_body
  end
end

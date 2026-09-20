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

class LazzzyTest < ActionDispatch::IntegrationTest
  def setup
    WebMock.reset!
    @original_config = Lazzzy.configuration
    @config = Lazzzy::Configuration.new
    @config.authorize = -> { demo_admin? }
    @config.interpreter = DemoInterpreter.new
    @config.execution_store = -> { Rails.cache }
    Lazzzy.instance_variable_set(:@configuration, @config)
    Rails.cache.clear
    @events = []
    events = @events
    @config.group "Test commands" do
      @config.command :grant, description: "Give tokens", aliases: ["give"], examples: ["give tokens"] do
        argument :user_id, :integer, extract: ->(text, _context) { text[/user (\d+)/, 1] }, validate: ->(value) { value.positive? }
        argument :amount, :integer, extract: ->(text, _context) { text[/(\d+) tokens/, 1] }, validate: ->(value) { value.between?(1, 1000) }
        execute { |args, _context|
          events << args
          Lazzzy::Result.message("Granted #{args[:amount]} tokens") }
      end
      @config.command :home, description: "Open home", examples: ["open home"] do
        execute { |_args, _context| Lazzzy::Result.navigate("/") }
      end
    end
    get "/"
    @csrf = Nokogiri::HTML(response.body).at_css('meta[name="csrf-token"]')["content"]
  end

  def teardown
    Lazzzy.instance_variable_set(:@configuration, @original_config)
  end

  def submit(headers: {}, **payload)
    post "/lazzzy/interpret", params: { context: {}, **payload }, as: :json, headers: { "X-CSRF-Token" => @csrf, **headers }
    response.parsed_body
  end

  def execute(ticket, headers: {})
    post "/lazzzy/execute", params: { ticket: ticket }, as: :json, headers: { "X-CSRF-Token" => @csrf, **headers }
    response.parsed_body
  end
end

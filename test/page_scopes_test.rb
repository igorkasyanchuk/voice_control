require_relative "test_helper"

class PageScopesTest < VoiceControlTest
  def scoped_command(pages: ["/users", %r{\A/users/\d+/edit\z}], **options)
    @config.command :scoped, description: "Update user", pages: pages, **options do
      argument :name, :string
      execute { |args, _context| VoiceControl::Result.message(args[:name], notify: "User updated.") }
    end
  end

  def test_scopes_filter_help_and_the_interpreter_without_relying_on_filtered_context
    scoped_command
    @config.context = ->(_client) { {} }
    seen = []
    @config.interpreter = ->(transcript:, context:, commands:) {
      seen.replace(commands.map(&:key))
      { command: "home", confidence: 1.0 }
    }
    ["/users", "/users/42/edit", "/settings", nil, "//users", "/users?tab=1", 123].each do |path|
      get "/voice_control/commands", params: { path: path }
      assert_response :success
      keys = response.parsed_body.fetch("commands").map { |item| item.fetch("key") }
      assert_includes keys, "home"
      assert_equal ["/users", "/users/42/edit"].include?(path), keys.include?("scoped")
    end
    submit(transcript: "open home", context: { path: "/settings" })
    refute_includes seen, "scoped"
    submit(transcript: "open home", context: { path: "/users" })
    assert_includes seen, "scoped"
  end

  def test_explicit_selection_and_followups_respect_scope
    scoped_command
    submit(command: "scoped", context: { path: "/settings" })
    assert_response :forbidden
    question = submit(command: "scoped", context: { path: "/users" })
    assert_equal "question", question.fetch("kind")
    submit(transcript: "Alex", continuation: question.fetch("continuation"), context: { path: "/settings" })
    assert_response :unprocessable_content
    ready = submit(transcript: "Alex", continuation: question.fetch("continuation"))
    assert_equal({ "kind" => "message", "message" => "Alex", "notification" => "User updated." }, execute(ready.fetch("ticket")))
  end

  def test_execution_rechecks_scope_and_authorization
    permitted = true
    scoped_command(pages: "/users", authorize: ->(_args, _context) { permitted })
    question = submit(command: "scoped", context: { path: "/users" })
    ready = submit(transcript: "Alex", continuation: question.fetch("continuation"), context: { path: "/users" })
    permitted = false
    execute(ready.fetch("ticket"))
    assert_response :forbidden
    permitted = true
    @config.commands.delete("scoped")
    scoped_command(pages: "/settings")
    execute(ready.fetch("ticket"))
    assert_response :forbidden
  end

  def test_invalid_scope_configuration_fails_early
    [[], [nil], 123, "users", "//users", "/users?tab=1"].each do |pages|
      assert_raises(ArgumentError) { scoped_command(pages: pages) }
    end
    scoped_command(pages: %r{\A/users\z})
    get "/voice_control/commands", params: { path: "/users" }
    assert_includes response.parsed_body.fetch("commands").map { |item| item.fetch("key") }, "scoped"
  end
end

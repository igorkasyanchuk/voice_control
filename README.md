# voice_control

**You say it. Your app does it.**

Voice and typed commands for Rails. Define actions in Ruby, keep your authorization, and give users a shortcut to the work they already do.

```ruby
VoiceControl.configure do |config|
  config.command :open_users,
    description: "Open users", aliases: ["show people"] do
    execute { |_args, _context| VoiceControl::Result.navigate(main_app.users_path) }
  end
end
```

Say **“show people.”** Your app opens its users page.

| You provide | voice_control handles |
| --- | --- |
| Ruby actions and permissions | Command matching, typed arguments, and follow-up questions |
| Existing buttons and forms | Optional page discovery: click, fill, select, check, and submit |
| Your Rails app | A Shadow DOM widget, searchable help, Turbo support, and JavaScript hooks |

**No runtime database, migrations, Node build, or CSS framework.** Rails 8.x, Ruby 4.0+, MIT. A short-lived execution cache is required; production uses a shared atomic cache.

The gem requires JSON 2.x because the supported Rails 8.0/8.1 versions use JSON APIs changed in JSON 3. Bundler applies this constraint automatically.

**Status:** unreleased. Installation currently uses this source checkout or a locally built gem. Commands execute immediately once their arguments are complete; no confirmation dialog is added. Start with navigation and actions you can safely expose to the authorized user.

[Quick start](#quick-start) · [Configuration](#configuration) · [Demo](#try-it-locally) · [Ruby DSL](docs/commands.md) · [Browser actions](docs/browser-actions.md) · [Deployment](docs/deployment.md)

## Quick start

Add it to your application's Gemfile:

```ruby
# Gemfile
gem "voice_control"
```

The gem is not published to RubyGems yet. Until release, [build and install a local copy](CONTRIBUTING.md#packaging), then use `bundle install --local` for the first command below.

```sh
bundle install
bin/rails generate voice_control:install
```

The generator creates an initializer and mounts `/voice_control`. Edit the generated initializer:

```ruby
VoiceControl.configure do |config|
  config.api_key = ENV.fetch("JEV_API_KEY")
  config.authorize = -> { current_user&.admin? } # Use your app's access check.
  config.browser_actions = true
  config.launcher_size = :small # Optional: smaller floating microphone button.

  config.group "Navigation" do
    config.command :home, description: "Open home", aliases: ["go home"] do
      execute { |_args, _context| VoiceControl::Result.navigate(main_app.root_path) }
    end
  end
end
```

Replace the initializer's example block rather than appending another `home` command. Supply your [Jev](https://docs.typesafe.ai/introduction/quickstart) key in the server environment and restart Rails. The key never reaches the browser.

Add the widget before `</body>` in your layout. Keep the existing CSRF tags in `<head>`:

```erb
<!-- In <head>, if your layout does not already include it: -->
<%= csrf_meta_tags %>

<!-- Before </body>: -->
<%= voice_control_widget %>
```

Sign in with an authorized account. Click the microphone or press **⌘⇧U / Ctrl+Shift+U**, then type **“go home.”** Open **?** to see available commands. Help selections work without a Jev key; free-form interpretation needs one. Authorization defaults to denying access until configured.

Assets are served by the engine. No importmap, bundler, or asset-manifest changes are needed. Standard cookie sessions and CSRF protection are required; API-only apps need those Rails facilities enabled. In development, a disabled `NullStore` gets a local MemoryStore fallback. [Configure a shared cache before production.](docs/deployment.md)

## Try it locally

Clone the repository (access is required while it is private), then start the demo:

```sh
git clone git@github.com:igorkasyanchuk/voice_control.git
cd voice_control
bundle install
bin/demo
```

Open [127.0.0.1:4100](http://127.0.0.1:4100). No credentials are needed: the demo uses deterministic local matching without a key, and Jev when `JEV_API_KEY` is present.

| Say or type | Where |
| --- | --- |
| `open users` | Any demo page |
| `give user 42 100 tokens` | Any demo page; updates the user's balance |
| `change my plan` | Any demo page; asks which plan |
| `fill workspace name with Studio North` | Settings |
| `submit` | After selecting a Settings field |
| `summarize workspace` | Settings only; shows details and a notice without reloading |
| `undo that` | After an unsaved field edit |

The standalone demo includes user CRUD, settings, account plans, and 24 seeded users. Its SQLite database persists changes between runs; SQLite is a development dependency, not a gem runtime requirement. [Demo guide →](docs/demo.md)

## More command examples

Add these inside your `VoiceControl.configure` block. Route examples assume your application has `users_path` and `reports_path`; replace them with your own routes.

**Search with a text argument:** “find users” asks for a search term; “find users named Alex” opens the results directly.

```ruby
config.command :find_users, description: "Find users by name",
  aliases: ["search users", "find users"], examples: ["find users named Alex"] do
  argument :query, :string, prompt: "Who are you looking for?",
    extract: ->(text, _context) { text[/\bnamed\s+(.+)\z/i, 1] }

  execute do |args, _context|
    VoiceControl::Result.navigate(main_app.users_path(q: args[:query]))
  end
end
```

**Choose from a fixed list:** “show weekly report” opens it; “show report” asks which period.

```ruby
config.group "Reports" do
  config.command :show_report, description: "Open a daily, weekly or monthly report",
    aliases: ["show report"], examples: ["show weekly report"] do
    argument :period, :enum, values: %w[daily weekly monthly],
      prompt: "Daily, weekly or monthly?",
      extract: ->(text, _context) { text[/\b(daily|weekly|monthly)\b/i, 1] }

    execute do |args, _context|
      VoiceControl::Result.navigate(main_app.reports_path(period: args[:period]))
    end
  end
end
```

**Return a message without navigating:** “what is my account ID” displays the signed-in account's ID. This example assumes your controller provides `current_user`.

```ruby
config.command :account_id, description: "Show my account ID",
  aliases: ["what is my account ID"] do
  execute do |_args, _context|
    VoiceControl::Result.message("Your account ID is #{current_user.id}.")
  end
end
```

**Trigger your JavaScript:** “show shortcuts” dispatches an event that your app can use to open a dialog.

```ruby
config.command :show_shortcuts, description: "Show keyboard shortcuts",
  aliases: ["show shortcuts"] do
  execute { |_args, _context| VoiceControl::Result.event("app:show-shortcuts") }
end
```

```javascript
// Add a <dialog id="keyboard-shortcuts"> to your app, then register this once.
window.addEventListener("app:show-shortcuts", () => {
  document.querySelector("#keyboard-shortcuts")?.showModal();
});
```

## Use your existing business logic

Commands are Ruby callbacks, not generated code. Add record-level permission checks for mutations:

```ruby
config.command :archive_project,
  description: "Archive a project",
  visible: -> { current_user.admin? },
  authorize: ->(args, _context) { policy(Project.find(args[:id])).archive? } do
  argument :id, :integer,
    extract: ->(text, _context) { text[/\bproject (\d+)\b/i, 1] },
    validate: ->(id) { id.positive? },
    prompt: "Which project ID?"

  execute do |args, _context|
    Project.find(args[:id]).archive! # Your existing operation.
    VoiceControl::Result.message("Project archived.")
  end
end
```

This example assumes your app provides `Project#archive!` and a Pundit-style `policy`. Callbacks run in the request controller; `main_app`, `current_user`, and your application helpers are available there. Arguments use symbol keys, context uses string keys. Your action owns transactions, tenant scoping, and domain idempotency.

Return `VoiceControl::Result.reload` after a successful mutation when the whole page should reflect the change, such as an account plan update. It reloads the current URL, including its query and fragment. Use `Result.message` for feedback without reloading, or `Result.event` for a targeted JavaScript update.

Add `notify:` to any result helper for an optional five-second completion notice. No reload is required:

```ruby
VoiceControl::Result.message("Preferences saved.", notify: "Saved successfully.")
VoiceControl::Result.event("account:updated", { plan: "premium" }, notify: "Plan updated.")
```

Both keep the current page in place. Use `VoiceControl::Result.reload(notify: "Plan updated.")` when you also want a reload; the notice carries across it. Results show a separate notice only when you opt in. [Result options →](docs/commands.md#results)

## Limit commands to relevant pages

Use `pages:` to offer a command only on matching paths:

```ruby
config.command :show_user_help, description: "Show user management help",
  pages: ["/users", %r{\A/users/\d+/edit\z}] do
  execute { |_args, _context| VoiceControl::Result.message("Edit the fields, then say submit.") }
end
```

Strings match exactly; regexes let you match routes containing IDs. Commands without `pages:` remain global, which is useful for navigation. Help and Jev receive only commands available on the current page. Page scopes are routing hints supplied by the browser; keep authorization in `authorize:`. [Scope rules →](docs/commands.md#page-scopes)

[Arguments, groups, authorization, and result types →](docs/commands.md)

## Work with the page

With `browser_actions = true`, voice_control discovers supported visible controls at command time. You do not register each button in Ruby.

- **Click and navigate:** “click Performance,” “go back,” “scroll to Billing.”
- **Edit:** “enter 500 into Token balance,” “select Premium from Plan,” “check notifications.”
- **Use the selected field:** “enter Hello,” “clear this field,” “submit.”
- **Undo:** restore the last unsaved VoiceControl field edit.

Unique exact click labels resolve directly. Other phrases use Jev; ambiguous matches ask which command you meant. Discovery refreshes after Turbo navigation and DOM changes. Removed or changed controls are rejected before execution.

Native dropdowns, checkboxes, radios, date/time inputs, and forms are supported. Iframes, other shadow roots, custom dropdowns, and multi-selects need application-specific commands. [Full browser-action guide →](docs/browser-actions.md)

Disable automatic browser actions on a page, or exclude just part of its DOM:

```html
<!-- In the page's head: Ruby commands remain available. -->
<meta name="voice-control-browser-actions" content="off">

<!-- Or on a control/container: excludes it and its descendants. -->
<section data-voice-control-ignore>Private controls go here</section>
```

These exclusions apply to discovery, help, and pending dynamic actions. [Exclusions and limits →](docs/browser-actions.md#exclude-pages-or-controls)

## Know what is sent and what can run

Jev receives the transcript, configured page context (current URL/path by default), and available command descriptions. Dynamic discovery also sends control labels, IDs/names, types, and dropdown labels. Existing field values, Ruby code, and page HTML are not sent; anything the user types or speaks as a command is part of the transcript. Speech recognition may use the browser vendor's service.

Use `data-voice-control-ignore` for private UI regions and a context callback to remove sensitive URL parameters. Jev chooses an allowed command; the server validates arguments and checks permissions before issuing and executing a signed, session-bound ticket. Duplicate tickets use an atomic cache claim. A confidence score is a routing signal, not an authorization check or a guarantee of intent.

[Privacy, deployment, cache setup, and failure semantics →](docs/deployment.md)

## Configuration

All configuration options are below. Merge the settings you need into `config/initializers/voice_control.rb`, keep your command definitions in the same block, and restart Rails. Values match the defaults except the API key, which is read from your environment.

```ruby
VoiceControl.configure do |config|
  # Server-side Jev key; a string or zero-argument callable. Default: nil.
  config.api_key = ENV["JEV_API_KEY"]

  # Jev model used to match natural-language commands.
  config.model = "jev-latest"

  # Engine endpoints inherit this controller's authentication and callbacks.
  config.parent_controller = "ApplicationController"

  # Widget/endpoint access; replace with your check, e.g. -> { current_user&.admin? }.
  config.authorize = -> { false }

  # Bind tickets to the signed-in user as well as the session; adapt for your auth system.
  config.identity = -> { respond_to?(:current_user, true) ? current_user&.id : nil }

  # Filter page context before matching; defaults to pass-through. Use .slice("path") to restrict it.
  config.context = ->(client_context) { client_context }

  # Discover labeled controls for click/fill/select/check/submit and page navigation commands.
  # Sends labels/IDs and dropdown labels to Jev; excludes existing field values.
  config.browser_actions = false

  # Open/close shortcut; mod means Cmd on macOS, Ctrl elsewhere. nil disables it.
  config.keyboard_shortcut = "mod+shift+u"

  # Hold to speak, release to submit; nil disables this shortcut.
  config.push_to_talk_shortcut = "mod+shift+space"

  # Widget corner: :bottom_right or :bottom_left.
  config.widget_position = :bottom_right

  # Button/icon size: :normal = 56px/24px; :small = 44px/20px. Panel size stays unchanged.
  config.launcher_size = :normal

  # Close and stop listening after this many milliseconds of inactivity; use a positive value.
  config.idle_timeout = 120_000

  # Browser request deadline in milliseconds (1_000..300_000); timed-out actions are never retried.
  config.request_timeout = 30_000

  # Matches below this score ask for disambiguation; calibrate for your vocabulary.
  config.confidence_threshold = 0.35

  # Show the latest transcript, Jev result and execution details; enable only for trusted users.
  config.debug = false

  # Default: Rails.cache, with a development-only MemoryStore fallback for NullStore.
  # Override with a shared atomic cache for production replay protection.
  # config.execution_store = -> { Rails.cache }

  # nil uses Jev; a custom callable accepts transcript:, context:, commands: and returns a match.
  config.interpreter = nil

  # Unexpected-error callback; defaults to logging the error class and command, not the transcript.
  config.on_error = ->(error, details) { Rails.logger.error("VoiceControl #{error.class} command=#{details[:command]}") }
end
```

For a manually mounted web component, use `data-launcher-size="small"` for the compact launcher. See the [configuration reference](docs/configuration.md) for the custom interpreter contract and [deployment guide](docs/deployment.md) for cache and privacy setup.

## Find the details

| Guide | Includes |
| --- | --- |
| [Commands](docs/commands.md) | DSL, argument types, visibility, authorization, results |
| [Browser actions](docs/browser-actions.md) | Supported controls, selection, submit, Undo, limits, debug JSON |
| [Integration](docs/integration.md) | Turbo, React, context, keyboard shortcuts, push-to-talk |
| [Configuration](docs/configuration.md) | Every option and default |
| [Deployment](docs/deployment.md) | Shared cache, privacy, CSP, rate limiting, troubleshooting |
| [Demo](docs/demo.md) | Local interpreter, Jev setup, SQLite data |
| [Contributing](CONTRIBUTING.md) | Tests, >95% coverage gates, browser checks, packaging |

**Debug a command:** set `config.debug = true`, restart Rails, and expand **Command details**. Inspect the matching source, chosen action, confidence, candidates, and Jev's choice/probabilities. Copy details for a reproducible report. Debug is off by default.

Voice uses browser Speech Recognition with English (`en-US`). Typing is the fallback when voice is unavailable. See [browser support and microphone requirements](docs/integration.md#browser-support).

## License

[MIT](LICENSE). Copyright © 2026 Igor Kasyanchuk.

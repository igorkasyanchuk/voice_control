# lazzzy

**You say it. Your app does it.**

Voice and typed commands for Rails. Define actions in Ruby, keep your authorization, and give users a shortcut to the work they already do.

```ruby
Lazzzy.configure do |config|
  config.command :open_users,
    description: "Open users", aliases: ["show people"] do
    execute { |_args, _context| Lazzzy::Result.navigate(main_app.users_path) }
  end
end
```

Say **“show people.”** Your app opens its users page.

| You provide | lazzzy handles |
| --- | --- |
| Ruby actions and permissions | Command matching, typed arguments, and follow-up questions |
| Existing buttons and forms | Optional page discovery: click, fill, select, check, and submit |
| Your Rails app | A Shadow DOM widget, searchable help, Turbo support, and JavaScript hooks |

**No runtime database, migrations, Node build, or CSS framework.** Rails 8.x, Ruby 4.0+, MIT. A short-lived execution cache is required; production uses a shared atomic cache.

Rails 8.0 applications must keep `gem "json", "< 3"` in their Gemfile: its JSON encoder uses an option removed in JSON 3. Rails 8.1 does not need this constraint.

**Status:** unreleased. Installation currently uses this source checkout or a locally built gem. Commands execute immediately once their arguments are complete; no confirmation dialog is added. Start with navigation and actions you can safely expose to the authorized user.

[Quick start](#quick-start) · [Demo](#try-it-locally) · [Ruby DSL](docs/commands.md) · [Browser actions](docs/browser-actions.md) · [Deployment](docs/deployment.md)

## Quick start

Clone the repository beside your Rails application (repository access is required while it is private):

```sh
git clone git@github.com:igorkasyanchuk/lazzzy.git ../lazzzy
```

Then add it to your application's Gemfile:

```ruby
# Gemfile
gem "lazzzy", path: "../lazzzy"
```

```sh
bundle install
bin/rails generate lazzzy:install
```

The generator creates an initializer and mounts `/lazzzy`. Edit the generated initializer:

```ruby
Lazzzy.configure do |config|
  config.api_key = ENV.fetch("JEV_API_KEY")
  config.authorize = -> { current_user&.admin? } # Use your app's access check.
  config.browser_actions = true

  config.group "Navigation" do
    config.command :home, description: "Open home", aliases: ["go home"] do
      execute { |_args, _context| Lazzzy::Result.navigate(main_app.root_path) }
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
<%= lazzzy_widget %>
```

Sign in with an authorized account. Click the microphone or press **⌘⇧U / Ctrl+Shift+U**, then type **“go home.”** Open **?** to see available commands. Help selections work without a Jev key; free-form interpretation needs one. Authorization defaults to denying access until configured.

Assets are served by the engine. No importmap, bundler, or asset-manifest changes are needed. Standard cookie sessions and CSRF protection are required; API-only apps need those Rails facilities enabled. In development, a disabled `NullStore` gets a local MemoryStore fallback. [Configure a shared cache before production.](docs/deployment.md)

## Try it locally

From this gem's directory:

```sh
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
| `undo that` | After an unsaved field edit |

The standalone demo includes user CRUD, settings, account plans, and 24 seeded users. Its SQLite database persists changes between runs; SQLite is a development dependency, not a gem runtime requirement. [Demo guide →](docs/demo.md)

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
    Lazzzy::Result.message("Project archived.")
  end
end
```

This example assumes your app provides `Project#archive!` and a Pundit-style `policy`. Callbacks run in the request controller; `main_app`, `current_user`, and your application helpers are available there. Arguments use symbol keys, context uses string keys. Your action owns transactions, tenant scoping, and domain idempotency.

[Arguments, groups, authorization, and result types →](docs/commands.md)

## Work with the page

With `browser_actions = true`, lazzzy discovers supported visible controls at command time. You do not register each button in Ruby.

- **Click and navigate:** “click Performance,” “go back,” “scroll to Billing.”
- **Edit:** “enter 500 into Token balance,” “select Premium from Plan,” “check notifications.”
- **Use the selected field:** “enter Hello,” “clear this field,” “submit.”
- **Undo:** restore the last unsaved Lazzzy field edit.

Unique exact click labels resolve directly. Other phrases use Jev; ambiguous matches ask which command you meant. Discovery refreshes after Turbo navigation and DOM changes. Removed or changed controls are rejected before execution.

Native dropdowns, checkboxes, radios, date/time inputs, and forms are supported. Iframes, other shadow roots, custom dropdowns, and multi-selects need application-specific commands. [Full browser-action guide →](docs/browser-actions.md)

## Know what is sent and what can run

Jev receives the transcript, configured page context (current URL/path by default), and available command descriptions. Dynamic discovery also sends control labels, IDs/names, types, and dropdown labels. Existing field values, Ruby code, and page HTML are not sent; anything the user types or speaks as a command is part of the transcript. Speech recognition may use the browser vendor's service.

Use `data-lazzzy-ignore` for private UI regions and a context callback to remove sensitive URL parameters. Jev chooses an allowed command; the server validates arguments and checks permissions before issuing and executing a signed, session-bound ticket. Duplicate tickets use an atomic cache claim. A confidence score is a routing signal, not an authorization check or a guarantee of intent.

[Privacy, deployment, cache setup, and failure semantics →](docs/deployment.md)

## Find the details

| Guide | Includes |
| --- | --- |
| [Commands](docs/commands.md) | DSL, argument types, visibility, authorization, results |
| [Browser actions](docs/browser-actions.md) | Supported controls, selection, submit, Undo, limits, debug JSON |
| [Integration](docs/integration.md) | Turbo, React, context, keyboard shortcuts, push-to-talk |
| [Configuration](docs/configuration.md) | Every option and default |
| [Deployment](docs/deployment.md) | Shared cache, privacy, CSP, rate limiting, troubleshooting |
| [Demo](docs/demo.md) | Local interpreter, Jev setup, SQLite data |
| [Contributing](CONTRIBUTING.md) | Tests, manual browser regression fixture, packaging |

**Debug a command:** set `config.debug = true`, restart Rails, and expand **Command details**. Inspect the matching source, chosen action, confidence, candidates, and Jev's choice/probabilities. Copy details for a reproducible report. Debug is off by default.

Voice uses browser Speech Recognition with English (`en-US`). Typing is the fallback when voice is unavailable. See [browser support and microphone requirements](docs/integration.md#browser-support).

## License

[MIT](LICENSE). Copyright © 2026 Igor Kasyanchuk.

[← README](../README.md)

# Define your vocabulary

Define commands inside `VoiceControl.configure`. Keys are unique, lower-case identifiers; `none` is reserved. Groups organize help and give Jev context.

```ruby
config.group "User management" do
  config.command :grant_credits,
    description: "Give a user credits",
    aliases: ["add credits", "top up credits"],
    examples: ["give user 42 100 credits"],
    visible: -> { current_user.admin? },
    authorize: ->(args, _context) { policy(User.find(args[:user_id])).grant_credits? } do

    argument :user_id, :integer,
      extract: ->(text, _context) { text[/\buser (\d+)\b/i, 1] },
      validate: ->(id) { id.positive? },
      prompt: "Which user ID?"

    argument :amount, :integer,
      extract: ->(text, _context) { text[/\b(\d+) credits\b/i, 1] },
      validate: ->(amount) { amount.between?(1, 1000) },
      prompt: "How many credits?"

    execute do |args, _context|
      GrantCredits.call(user_id: args[:user_id], amount: args[:amount])
      VoiceControl::Result.message("Credits added.")
    end
  end
end
```

Your action owns transactions and domain invariants. Jev receives descriptions and aliases, never your Ruby callbacks, and cannot create a new action or URL.

Callbacks run in the request controller, where `current_user`, `policy`, and `main_app` route helpers are available. `args` has symbol keys; context has string keys. `visible` runs during discovery and interpretation; `authorize` receives complete, validated arguments and runs before issuing a ticket and again before execution. Both default to allowing the command **within the overall access gate**. Supply record-level authorization for actions on a target record.

### Page scopes

Add `pages:` to a command to restrict its availability:

```ruby
config.command :settings_help, description: "Explain workspace settings",
  pages: "/settings", aliases: ["help with settings"] do
  execute { |_args, _context| VoiceControl::Result.message("Change the workspace fields, then say submit.") }
end

config.command :user_help, description: "Explain the user form",
  pages: ["/users/new", %r{\A/users/\d+/edit\z}] do
  execute { |_args, _context| VoiceControl::Result.message("Enter a name, email and plan, then save.") }
end
```

`pages:` accepts one exact local path, one Ruby `Regexp`, or a nonempty array of either. Omit it (or use `nil`) for global availability. Exact paths are case-sensitive and include trailing slashes; do not include a query string, fragment, or host. Anchor regexes with `\A` and `\z` when you want a whole-path match. Missing or invalid paths hide scoped commands.

The widget sends the current pathname to help and interpretation. Scope filtering happens before Jev matching and explicit command selection, and uses the original pathname again when executing a signed ticket. Changing scope configuration can invalidate a pending command. Navigating away cancels follow-ups, and stale help responses are discarded. This routing path is stored separately from the context passed through `config.context`, so removing URL context for privacy does not disable scopes.

Scopes are **not authorization**: a client can forge its path, and the server cannot verify the tab's actual location. Keep record/tenant permission checks in `authorize:`. `visible:` still applies on every page. Custom API clients send `context: { path: "/settings" }` to interpretation and `?path=/settings` to the catalog endpoint. Follow-ups may omit the path to retain their signed original path; supplying a different path rejects the follow-up. Custom routers can call [`window.VoiceControl.refresh()`](integration.md) after a route change.

### Arguments

| Type | Accepted values |
| --- | --- |
| `:string` | Nonempty text, up to 2,000 characters |
| `:integer` | Whole decimal digits, with optional sign; validated before execution |
| `:decimal` | Plain decimal input; returned as a decimal string to preserve precision |
| `:boolean` | `yes/no`, `true/false`, `on/off` |
| `:enum` | One configured value, matched without case sensitivity (spaces and underscores are interchangeable) |

```ruby
argument :plan, :enum, values: %w[free premium premium_plus]
argument :enabled, :boolean, default: false
argument :note, :string, required: false
argument :user_id, :integer,
  default: ->(_text, context) { context["user_id"] }
```

Arguments are required by default. `extract` gets `(transcript, context)`; a `nil` result falls back to `default`, which can be a value or a callback with the same signature. `validate` receives the coerced value. An invalid or missing required value prompts for that argument. Follow-ups accept the value itself, for example `42` or `premium`.

Jev routes intent; it does not extract arbitrary text. Define extractors for values that should be collected from the first utterance. Without one, the widget asks for the value. Decimal callbacks can use `BigDecimal(args[:amount])` when performing arithmetic.

### Results

Return one of:

```ruby
VoiceControl::Result.message("Done.")
VoiceControl::Result.reload # Reload the current page after saving changes
VoiceControl::Result.navigate(main_app.users_path) # Local paths only
VoiceControl::Result.event("workspace:refresh", { user_id: args[:user_id] })
VoiceControl::Result.click("#save-settings")
VoiceControl::Result.fill("#workspace-name", args[:value])
VoiceControl::Result.focus("#workspace-name")
```

Every helper accepts optional `notify:` text for a five-second completion notice:

```ruby
VoiceControl::Result.message("Preferences saved.", notify: "Saved successfully.")
VoiceControl::Result.reload(notify: "Your plan is now Premium.")
VoiceControl::Result.navigate(main_app.users_path, notify: "User saved.")
VoiceControl::Result.event("workspace:refresh", { user_id: args[:user_id] }, notify: "Workspace updated.")
```

Return a notified result only after the action succeeds. Notifications accept 1–200 characters, render as plain text, and are absent by default. Failed browser actions do not show a success notice. Event notices mean the event was dispatched, not that an asynchronous listener finished. During navigation, the notice is briefly stored in this tab's `sessionStorage` until its five-second expiry; avoid secrets in notification text.

Navigation uses Turbo when available, otherwise a full-page visit. `reload` performs a full browser reload of the current URL, preserving its query and fragment and fetching fresh page state. Return it after a successful change that needs the whole page updated, such as changing an account plan. Events are dispatched on `window`:

```javascript
window.addEventListener("workspace:refresh", (event) => {
  refreshUser(event.detail.user_id)
})
```

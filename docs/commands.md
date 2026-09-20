[← README](../README.md)

# Define your vocabulary

Define commands inside `Lazzzy.configure`. Keys are unique, lower-case identifiers; `none` is reserved. Groups organize help and give Jev context.

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
      Lazzzy::Result.message("Credits added.")
    end
  end
end
```

Your action owns transactions and domain invariants. Jev receives descriptions and aliases, never your Ruby callbacks, and cannot create a new action or URL.

Callbacks run in the request controller, where `current_user`, `policy`, and `main_app` route helpers are available. `args` has symbol keys; context has string keys. `visible` runs during discovery and interpretation; `authorize` receives complete, validated arguments and runs before issuing a ticket and again before execution. Both default to allowing the command **within the overall access gate**. Supply record-level authorization for actions on a target record.

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
Lazzzy::Result.message("Done.")
Lazzzy::Result.navigate(main_app.users_path) # Local paths only
Lazzzy::Result.event("workspace:refresh", { user_id: args[:user_id] })
Lazzzy::Result.click("#save-settings")
Lazzzy::Result.fill("#workspace-name", args[:value])
Lazzzy::Result.focus("#workspace-name")
```

Navigation uses Turbo when available, otherwise a full-page visit. Events are dispatched on `window`:

```javascript
window.addEventListener("workspace:refresh", (event) => {
  refreshUser(event.detail.user_id)
})
```

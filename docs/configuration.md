[← README](../README.md)

# Configuration reference

Set options in `config/initializers/lazzzy.rb` inside `Lazzzy.configure`. Restart Rails after editing the vocabulary or initializer. The DSL is process configuration, not automatically reloaded application code.

| Option | Default | Purpose |
| --- | --- | --- |
| `api_key` | `nil` | Jev key string or zero-argument callable; server only. Required for free-form Jev matching. |
| `model` | `"jev-latest"` | Provider model name. |
| `parent_controller` | `"ApplicationController"` | Host controller class name; includes its authentication/callbacks. |
| `authorize` | `-> { false }` | Overall widget and endpoint access, in controller context. |
| `identity` | `current_user&.id` when available | Binds tickets to the authenticated identity, in addition to the session. Override for other auth systems. |
| `context` | Pass supplied context through | Sanitize/allowlist context before interpretation. Receives a hash with string keys. |
| `browser_actions` | `false` | Discover supported page controls and enable dynamic actions. |
| `debug` | `false` | Show latest diagnostics, including the validated Jev action answer. |
| `confidence_threshold` | `0.35` | Lower-confidence matches ask which candidate to use. Calibrate for your vocabulary. |
| `execution_store` | `Rails.cache`, development-only NullStore fallback | Zero-argument callable returning an atomic cache. [Production requirements](deployment.md). |
| `on_error` | Log error class and command key | Callable receiving `(exception, details)`; details contains `command` and `controller`. |
| `interpreter` | Jev | Custom callable with `transcript:`, `context:`, `commands:`. See below. |
| `keyboard_shortcut` | `"mod+shift+u"` | Open/close; `nil` disables it. `mod` is Cmd on macOS, Ctrl elsewhere. |
| `push_to_talk_shortcut` | `"mod+shift+space"` | Hold/release speech; `nil` disables it. |
| `idle_timeout` | `120_000` | Milliseconds before the open widget closes for inactivity; use a positive number. |
| `widget_position` | `:bottom_right` | `:bottom_right` or `:bottom_left`. |
| `launcher_size` | `:normal` | `:small` uses a 44px button/20px icon; `:normal` uses 56px/24px. Panel width is unchanged. |

A custom interpreter chooses from the supplied authorized catalog and returns symbol keys:

```ruby
config.interpreter = lambda do |transcript:, context:, commands:|
  match = commands.find { |command| command.aliases.include?(transcript.downcase) }
  { command: match&.key, confidence: match ? 1.0 : 0.0, candidates: [] }
end
```

This is an intentionally small exact-alias example, not a natural-language parser. Return `command: nil` for no match. `confidence` is numeric from 0 to 1; `candidates` is an array of existing command keys used for disambiguation. A unique exact browser click and an explicit help selection bypass the interpreter. No Ruby action should run inside the interpreter.

The bundled demo's local interpreter is for examples and tests; it is not a runtime dependency or an automatic production fallback when Jev fails.

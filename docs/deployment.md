[← README](../README.md)

# Execution and errors

The widget shows **“Understanding…”** while preparing or interpreting a command, then **“Running…”** after it receives a ticket and requests execution. Follow-up questions and ambiguous choices remain in the interpretation stage until a command is ready.

Interpretation never runs an action. It issues an expiring, session-bound ticket; the widget submits it automatically. The execution endpoint validates arguments and permissions again before invoking your block. Tickets also bind to `current_user.id` when available. For another authentication system:

```ruby
config.identity = -> { current_account.id }
```

Duplicate submissions are rejected using an atomic cache write. **Use a shared cache across Rails processes**, such as Redis or Memcached, with `write(..., unless_exist: true, expires_in: ...)` support:

```ruby
config.execution_store = -> { Rails.cache }
```

The dummy app uses MemoryStore for its single process. No database is required, but this short-lived execution cache is required for actions. Cache eviction or a cache reset can remove replay protection; business-critical actions should additionally use your domain's durable idempotency controls. Tickets expire after ten minutes. Failed executions remain claimed because an external side effect might already have occurred. There are no automatic retries of actions or Jev calls.

```ruby
config.on_error = ->(exception, details) { ErrorTracker.capture(exception, extra: details.except(:controller)) }
config.confidence_threshold = 0.35
config.model = "jev-latest"
```

Unexpected errors produce a generic message in the widget. The callback receives the exception and command context. Jev has bounded connection/read/write timeouts of 3/15/5 seconds. Missing credentials fail gracefully; help and direct command selection still work.

## Production configuration

A minimal deployment uses your existing authentication, cookie session/CSRF middleware, a server-side Jev key, and a shared cache. The gem does not create users, roles, database tables, or infrastructure.

```ruby
# config/environments/production.rb
# Add the redis gem to your application's Gemfile if it is not already installed.
config.cache_store = :redis_cache_store, {
  url: ENV.fetch("REDIS_URL"),
  namespace: "my-app-cache"
}
```

```ruby
# Inside Lazzzy.configure in your initializer:
config.execution_store = -> { Rails.cache }
config.debug = false
config.authorize = -> { current_user&.admin? }
config.identity = -> { current_user&.id }
config.context = lambda do |client|
  { "path" => client["path"], "area" => client["area"] }.compact
end
```

Use a cache shared by every web process and avoid evicting replay keys before their 11-minute TTL. Keep your existing cache configuration if it already meets these requirements. The default execution store uses Rails.cache; only development gets a single-process MemoryStore fallback when Rails.cache is a NullStore. Tests, staging, and production do not get that fallback. NullStore and failed cache claims prevent execution. They are not a substitute for durable idempotency on money or other business-critical operations.

Start with a small command vocabulary. Explicit record/tenant policies belong in each mutation's `authorize` callback; a UI label, model confidence, supplied URL, or hidden button is never an authorization boundary. Exact browser clicks bypass model matching, but still use the same ticket/access checks. The default confidence threshold is 0.35; evaluate it against your own vocabulary before rollout. Increasing it (for example, `config.confidence_threshold = 0.75`) asks for disambiguation more often. Neither value guarantees that a model inferred the right intent.

The gem does not impose per-user/provider rate limits. Apply your application's existing Rails rate limiter or Rack middleware to `/lazzzy/interpret` and `/lazzzy/execute`, keyed to your authenticated identity. Account for these requests in provider cost and latency monitoring. `on_error` handles unexpected failures; expected authorization/validation rejections are HTTP responses.

### Privacy and logs

The default URL context includes its query and fragment. Filter context before it reaches Jev when a URL can contain reset tokens, emails, or other private data. `data-lazzzy-ignore` prevents a control/subtree from being discovered; label attributes and nearby row identities can otherwise contain application data. Debug is for trusted users and includes the current transcript. Never share copied diagnostics without checking their contents.

Rails request logs may include payloads even though lazzzy has no history database. Filter them in your app:

```ruby
# config/initializers/filter_parameter_logging.rb
Rails.application.config.filter_parameters += %i[
  transcript continuation ticket browser_page context
]
```

Signed tickets provide integrity, not encryption: the issuing browser can read their state. Do not put secrets in context or argument defaults. The browser's speech service has separate data handling from Jev; review both for your application.

### CSP and network requirements

Allow the engine's same-origin JavaScript and CSS in your CSP (`script-src` / `style-src`) and same-origin Fetch requests in `connect-src`. The Rails helper passes the Rails script nonce. Styles load through a link inside the shadow root. No `unsafe-eval` is used. Strict Trusted Types policies need their own integration check because the widget creates its static markup with `innerHTML`.

Only the Rails server calls Jev at `https://api.typesafe.ai/v1/systemone`. Do not expose the API key to JavaScript or add the provider to browser `connect-src`. Browser speech recognition may separately require access to the browser vendor's service. Keep asset endpoints public, command endpoints authenticated, and reverse-proxy access logs free of command bodies.

### Cancellation and failures

Closing or canceling during interpretation prevents a later response from triggering execution. Once `/execute` has been sent, aborting the browser request cannot roll back server work. Check the result before issuing the command again. A claimed ticket remains consumed even if the action fails. There is no automatic action retry or database rollback supplied by the gem.

### Troubleshooting

| Symptom | Check |
| --- | --- |
| No widget | Authorization defaults to false. Confirm the signed-in account, helper in the active layout, and public asset responses. |
| Works through help, but typed phrases fail | The Jev key, server egress, provider response, and debug matching details. |
| Session changed / HTTP 422 | Current CSRF meta tag, cookies, inherited controller callbacks, and expired tickets. Reload after signing in/out. |
| HTTP 403 | Overall access, command visibility, record policy, and changed user identity. |
| Commands refuse to execute with caching disabled | Development uses a local fallback; elsewhere configure a shared atomic execution store. |
| Too many page controls | Dynamic discovery has a 200-control bound. Exclude irrelevant sections with `data-lazzzy-ignore`, or turn it off and use your Ruby vocabulary. |
| This command is too large | Shorten the transcript/context or narrow the discovered controls. Signed state is capped at 32KB. |
| Control/form changed | Restart the command after navigation, DOM replacement, relabeling, or form destination changes. |
| Wrong model match | Inspect Jev JSON, make descriptions/aliases distinct, reduce overlapping commands, or raise the threshold. Use exact click labels for page controls. |
| Voice unavailable | Use typing; check HTTPS, browser support, and microphone permission. |

### Release checks

Before publishing a public release, verify the repository links are accessible to your intended audience, establish a private security-reporting channel, and test real microphone input in each supported browser. A screenshot or short recording can then demonstrate navigation, a follow-up, a form edit, and Undo without claiming support that was not tested. The current source checkout has not been published to RubyGems.

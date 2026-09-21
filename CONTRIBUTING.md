# Contributing

Use Ruby 4.0+ and Rails 8.x. From this gem's directory:

```sh
bundle install
bundle exec rake test
bundle exec rubocop --ignore-parent-exclusion
npm ci --ignore-scripts
npm run test:coverage
npm run lint
bin/demo
```

Minitest uses an isolated SQLite dummy app and stubs Jev HTTP calls. It does not require a provider key or make paid calls. Add a failing regression before fixing behavior. Keep application-specific services and policies outside the gem. Runtime JavaScript is shipped directly; no Node build is required.

## Coverage

Run `bundle exec rake test` for Ruby coverage and `npm run test:coverage` for JavaScript coverage (Node 24.15+ or 26+; CI uses Node 24). Both commands fail if line or branch coverage falls below **95.01%**. JavaScript also enforces 95.01% statements and functions.

Open `coverage/ruby/index.html` and `coverage/javascript/index.html` for uncovered lines and branches. Machine-readable reports are at `coverage/ruby/coverage.json` and `coverage/javascript/coverage-summary.json`; CI uploads the reports even when a test or threshold fails.

Ruby coverage includes all executable Ruby under `lib`, `app`, and `config`, including generator code and its initializer template. JavaScript coverage includes all `assets/**/*.js`. Tests, the dummy app, examples, dependencies, and reports are outside those production scopes; unloaded production files still count. Keep the scopes intact and add behavioral tests instead of coverage-ignore comments. Run the full suite for a representative report; individual Ruby test files are still subject to the aggregate coverage gate.

The JavaScript suite uses Vitest, jsdom, and V8. It exercises the real widget and DOM events with stubbed HTTP/speech and simulated layout, animation, and scrolling APIs. These percentages do not prove microphone recognition or real-browser rendering: keep running the browser checks below for native form submission, navigation, and layout behavior.

## Browser checks

Run the Playwright suite in Chromium, Firefox, and WebKit:

```sh
npx playwright install chromium firefox webkit
npm run test:browser
```

The suite starts its own local fixture server and runs in CI. It covers native form submission, cancellation, stale forms, reconnection, debug rendering, request timeouts, optional completion notices, and consecutive speech commands across real Turbo navigation and full reloads. Speech events and provider responses are simulated; no Jev key or microphone is required. Test real recognition and permissions separately.

Open `playwright-report/index.html` for results; failing tests retain traces under `test-results/`. CI uploads both directories. To inspect the dependency-free regression fixture manually, run `python3 -m http.server 4205 --bind 127.0.0.1` and open [the fixture](http://127.0.0.1:4205/test/browser/index.html).

JavaScript lint configuration is provided in `eslint.config.mjs`; use ESLint 9 or 10 and Prettier 3 when editing assets. Test Turbo navigation in the dummy app and custom router behavior in your integration. Run against real Redis when changing replay protection; separate processes must claim a ticket only once.

CI tests Rails 8.0 and 8.1. To select a version locally, use a separate checkout without its ignored lockfile and run `RAILS_VERSION='~> 8.0.0' bundle install`, then `RAILS_VERSION='~> 8.0.0' bundle exec rake test`. The gemspec constrains JSON below 3 for both supported Rails versions. Use fresh dependency resolution when changing dependencies; an existing local lockfile can hide CI failures.

## Packaging

```sh
gem build voice_control.gemspec
gem install --local voice_control-0.1.0.gem
gem contents voice_control --show-install-dir # After installing your local build
```

Inspect the archive: runtime files, examples, and documentation should be present; demo databases, logs, credentials, test output, and development dependencies must not ship. Install the built gem in a disposable Rails application, run `voice_control:install`, and verify authorization, CSRF, rendering, and a complete command. Source-path tests alone do not verify packaging.

Document public configuration and behavior changes, update CHANGELOG.md, and include reproduction steps for browser issues. Do not add framework-wide abstractions for a single command. A bug report should contain Ruby/Rails/browser versions, the minimal vocabulary, expected/actual behavior, and redacted command diagnostics.

The repository is currently private and the gem is not published to RubyGems. A private vulnerability-reporting channel must be established before public release.

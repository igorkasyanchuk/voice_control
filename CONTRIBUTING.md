# Contributing

Use Ruby 4.0+ and Rails 8.x. From this gem's directory:

```sh
bundle install
bundle exec rake test
bundle exec rubocop --ignore-parent-exclusion
bin/demo
```

Minitest uses an isolated SQLite dummy app and stubs Jev HTTP calls. It does not require a provider key or make paid calls. Add a failing regression before fixing behavior. Keep application-specific services and policies outside the gem. Runtime JavaScript is shipped directly; no Node build is required.

## Browser checks

Serve this gem directory with a local static HTTP server, then open `test/browser/index.html`. For example, if Python is installed:

```sh
python3 -m http.server 4205 --bind 127.0.0.1
```

Open [the regression fixture](http://127.0.0.1:4205/test/browser/index.html). The page reports pass/fail for cancellation, speech event timing, stale forms, reconnection, native form submission, and debug rendering. It has no npm dependencies and never calls Jev. Speech is simulated; test actual microphone behavior separately. Browser CI is not included yet.

JavaScript lint configuration is provided in `eslint.config.mjs`; use ESLint 9 or 10 and Prettier 3 when editing assets. Test Turbo navigation in the dummy app and custom router behavior in your integration. Run against real Redis when changing replay protection; separate processes must claim a ticket only once.

CI tests Rails 8.0 and 8.1. To select a version locally, use a separate checkout without its ignored lockfile and run `RAILS_VERSION='~> 8.0.0' bundle install`, then `RAILS_VERSION='~> 8.0.0' bundle exec rake test`. Rails 8.0 also needs JSON below 3; the development Gemfile applies that constraint for this matrix entry.

## Packaging

```sh
gem build lazzzy.gemspec
gem install --local lazzzy-0.1.0.gem
gem contents lazzzy --show-install-dir # After installing your local build
```

Inspect the archive: runtime files, examples, and documentation should be present; demo databases, logs, credentials, test output, and development dependencies must not ship. Install the built gem in a disposable Rails application, run `lazzzy:install`, and verify authorization, CSRF, rendering, and a complete command. Source-path tests alone do not verify packaging.

Document public configuration and behavior changes, update CHANGELOG.md, and include reproduction steps for browser issues. Do not add framework-wide abstractions for a single command. A bug report should contain Ruby/Rails/browser versions, the minimal vocabulary, expected/actual behavior, and redacted command diagnostics.

The repository is currently private and the gem is not published to RubyGems. A private vulnerability-reporting channel must be established before public release.

# Changelog

## 0.1.0 (unreleased)

- Allow installation on Ruby 3.2+; CI runs on Ruby 4.0.
- Stay within Jev's 255-choice limit: skip the longest commands beyond 254 and log a warning instead of failing the request.
- Add `speech_language` to configure the browser speech recognition language.
- Rename the gem and repository to `voice_control`, with `VoiceControl` Ruby/JavaScript APIs, `voice_control:install`, and the `voice-control-widget` component.
- Add `pages:` command scopes for exact paths and regexes, with navigation-aware help and a custom-router `VoiceControl.refresh()` hook.
- Add a page-wide dynamic-action opt-out meta tag; enforce ignored forms for externally associated controls.
- Reject delayed command execution after navigation and links whose navigation behavior changed while pending.
- Document notifications without reload and add a scoped workspace-summary demo command.
- Bound widget requests with configurable `request_timeout`; report uncertain execution without retrying actions.
- Add optional `notify:` completion notices to result helpers, preserved briefly across navigation and reloads.
- Restore continuous listening after command-triggered reloads and browser back/forward cache restoration.
- Run real Turbo navigation, reload, timeout, and widget regressions in Chromium, Firefox, and WebKit CI.
- Add Ruby and JavaScript coverage reports, behavioral tests, and CI coverage gates above 95%.
- Keep both “Logout” and “Log out” out of suggested commands.

- Add `VoiceControl::Result.reload` to refresh the current page after successful commands.

- Deduplicate equivalent links in browser actions, help, and command choices.

- Constrain JSON to 2.x for Rails 8.0/8.1 compatibility in fresh installs and CI.

- Add a small launcher option, explain initializer settings, and expand the README with command examples.

- Discover only controls with readable text or labels, and show command descriptions alongside Jev probability IDs.

- Prevent canceled interpretations and incomplete speech fragments from executing; restore listeners after widget reinsertion.
- Reject changed form ownership/submit behavior and oversized signed state before issuing unusable tickets.
- Add a development-only execution cache fallback, dependency-free browser regression fixtures, and Rails 8.0/8.1 CI coverage.
- Reorganize the README and ship guides for commands, browser actions, configuration, deployment, and privacy.

- Resolve exact browser click labels before Jev, and show Jev's action answer, probabilities, and readable candidates in debug mode.

- Add “submit” for the active form, with native validation, submitter semantics, and stale-form protection.

- Add browser back/forward commands and separate interpretation/execution progress messages.

- Add keyboard help navigation, configurable left/right positioning, and a hold-to-talk shortcut.
- Support native date/time entry and contextual labels for generic table-row actions.

- Highlight action targets, clear named/selected fields with Undo, and scroll the page or discovered headings.
- Add typo-tolerant help search and a Copy details button for the latest debug report.

- Discover checkbox check/uncheck and radio choose actions, including spoken aliases and checkbox undo.
- Add opt-in command diagnostics, a green/cream widget, and a Google-inspired demo design.

- Add a Rails engine with configurable parent controller and authorization.
- Define grouped Ruby commands with typed arguments, extractors, defaults and validation.
- Route commands through Jev and collect missing arguments with signed continuations.
- Add automatic execution with CSRF, session binding and cache-based replay protection.
- Add a Shadow DOM voice/typing widget with Turbo support, browser events and help.
- Include an install generator and a credential-free dummy app.

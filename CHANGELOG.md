# Changelog

## 0.1.0 (unreleased)

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

# Security

VoiceControl is currently unreleased. Do not use public issues to disclose exploitable vulnerabilities, credentials, transcripts, or private page data. Before public publication, the maintainer must establish and publish a private reporting channel; this checkout does not yet advertise one.

## Integration boundary

- Overall authorization defaults to deny. Add record-level authorization and tenant scoping to mutation commands.
- Jev matches intent; it does not authorize operations. Commands execute immediately after validation, without a confirmation dialog.
- Tickets are signed, expire, and bind to the session and configured identity. They are readable by the client, not encrypted.
- Production replay protection requires a shared atomic cache. Eviction, outages, or resets are application operational concerns; business-critical actions also need durable idempotency.
- Browser manifests and page context are untrusted. Underlying HTTP endpoints must enforce their own permissions.
- Transcripts/context/control labels may be sent to Jev. Browser speech recognition may use another remote service. Exclude sensitive labels, filter context and Rails logs, and keep provider keys server-side.
- Closing the widget cannot undo a server operation already in progress.

See [deployment guidance](docs/deployment.md) for configuration, logging, CSP, rate limiting, and failure semantics. Report findings with a minimal reproduction and affected versions, without real user data.

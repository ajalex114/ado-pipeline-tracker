# Copilot Instructions for `ado-pipeline-tracker`

These instructions apply to all implementation and maintenance work in this project.

## Engineering standards
- Follow industry-standard coding practices.
- Apply SOLID principles where applicable and practical.
- Prefer clear, maintainable, testable design over shortcuts.

## Logging and privacy
- Add meaningful logging for key flows (tracking start/stop, polling cycle outcomes, notification triggers, validation failures, recoverable API errors).
- Never log sensitive information (credentials, auth tokens, cookies, full personal data payloads).
- Keep logs structured and action-oriented to support troubleshooting.

## Metrics and usage telemetry
- Capture product usage metrics to understand adoption and behavior (for example: tracked build added, tracking auto-stopped, notification emitted, settings toggled, shortcut-triggered tracking).
- Ensure metrics are privacy-safe and avoid sensitive identifiers where not required.
- Make instrumentation consistent and versionable so events can evolve safely.

## Testing
- Add and maintain test cases for new behavior and regressions.
- Cover core scenarios including happy path, failures, deduplication, and terminal-state handling.
- Keep tests updated whenever behavior changes.

## Behavior document (mandatory)
- Create and maintain the behavior reference at `docs/behavior.md`.
- Update `docs/behavior.md` for every behavior-impacting change.
- Consult `docs/behavior.md` before changing code and before implementing user-facing behavior updates.


# ADO Pipeline Tracker

A Microsoft Edge (Chromium) browser extension that tracks **specific Azure DevOps build runs**,
shows live stage-by-stage progress, and raises desktop notifications when a stage or the whole
build finishes or fails.

Built with **TypeScript + React + Vite** on **Manifest V3**.

## Features

- **Track a specific build run** — by pasting its URL, by a keyboard shortcut on a build page, or
  with the **Track Current Build** button in the popup. Only run-level URLs are accepted (pipeline
  links are rejected to keep tracking low-noise).
- **Live progress** — overall status plus per-stage state (running / done / failed), refreshed in
  the background on a browser-supported cadence, independent of the tab you started from. Each
  build card also has its own ⟳ refresh button.
- **Rerun failed jobs** — rerun a failed/canceled build's failed jobs, or retry a single failed
  stage, straight from the popup. Tracking resumes automatically for the new attempt.
- **Desktop notifications** — for stage completion/failure and build completion/failure, fully
  configurable per event type, deduplicated to fire once per unique transition (a rerun
  attempt notifies again). Build notifications include the result (Succeeded, Failed, …).
- **In-browser alerts** — a badge on the (pinned) toolbar icon counts finished builds you haven't
  viewed (red if any failed), and the popup opens automatically when a build finishes. Both can be
  turned off in Settings.
- **7-day event history** — recent transitions are kept locally and auto-pruned.
- **Privacy-first** — uses your existing signed-in Azure DevOps session; no credentials or tokens
  are ever stored, and logs never contain sensitive data.

## Project docs

| Doc                               | Purpose                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `docs/spec.md`                    | Product & technical spec (interview outcome)                                 |
| `docs/behavior.md`                | Canonical behavior reference — consult/update on every change                |
| `docs/interview-memory.md`        | Full interview Q&A history                                                   |
| `.github/copilot-instructions.md` | Engineering standards for this repo                                          |
| `PRIVACY_POLICY.md`               | Public privacy policy for Chrome and Edge store listings                     |
| `store/listing.md`                | Store descriptions, permission justifications, artwork, and submission steps |

## Getting started

```bash
npm ci --registry=https://registry.npmjs.org
npm run build      # type-check + production build into dist/
```

Then load it in the browser:

1. Open `edge://extensions` (or `chrome://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/` folder.
4. Sign in to Azure DevOps in the same browser profile.

### Using it

- Open a specific build run (URL contains `buildId=...`) and click the toolbar icon → **Track
  Current Build**, or press **Alt+Shift+T**.
- Or paste a build-run URL into the popup's input and click **Add**.
- Configure notifications and the log level from the **Settings** page.
- Change the keyboard shortcut at `edge://extensions/shortcuts`.

## Development

```bash
npm run dev        # rebuild on change (load dist/ as unpacked)
npm run typecheck  # tsc --noEmit
npm test           # vitest unit/integration tests
npm run lint       # eslint
npm run format     # prettier
```

### Source publishing and CI

The GitHub Actions workflow in `.github/workflows/ci.yml` runs a clean install,
production build, lint, and tests on Node.js 22 for pushes and pull requests.
It expects this project directory to be the repository root.

Before pushing, review the staged files and include only this project's source.
Browser captures in `.playwright-mcp/` can contain session tokens and internal
metadata; that directory, local environment files, logs, `node_modules/`, and
`dist/` are excluded from Git. Do not force-add them or share the whole working
directory as an archive. For a store upload, use `npm run package` to create a runtime-only ZIP in `release/`.

## Architecture

```
src/
  manifest.json            MV3 manifest (Edge/Chromium)
  shared/                  Framework-agnostic types, config, messaging, view-models
  core/
    ado/                   URL parsing/validation, REST client, response mappers
    storage/               chrome.storage repository + retention rules
    tracking/              TrackerService (orchestration) + pure transition detector
    notifications/         Notifier + chrome.notifications port (dedupe + settings)
    logging/               Privacy-safe structured logger (secret redaction)
    metrics/               Usage metrics collector
    container.ts           Composition root (dependency wiring)
  background/              MV3 service worker (alarms-driven polling, message router)
  popup/                   React popup UI
  options/                 React settings UI
tests/                     Vitest suites for core logic
```

Design notes:

- **Tab-independent tracking**: polling is driven by `chrome.alarms` in the background service
  worker, so closing the build tab does not stop tracking. All durable state lives in
  `chrome.storage`, so the ephemeral MV3 worker can be torn down and restarted safely.
- **SOLID / testability**: IO boundaries (ADO client, storage, notification transport) are
  injected behind interfaces, so core logic is unit-tested without the browser runtime.
- **Least privilege**: only `storage`, `notifications`, `alarms`, and `tabs` permissions, scoped to
  Azure DevOps hosts.

## Publishing (Edge Add-ons / Chrome Web Store)

```bash
npm run package    # build + validated runtime-only ZIP under release/
```

Use the [store submission reference](store/listing.md) for copy-ready listing
text, privacy disclosures, reviewer notes, and upload instructions. PNG logos,
promotional tiles, and fictional-data screenshots are in `store/assets/`.
Screenshot generation uses a fresh isolated browser and never your existing
profile or deployment. See the [privacy policy](PRIVACY_POLICY.md) for the actual
data practices; build metadata is stored locally, not "no data stored".

The initial store version is 1.0.0. For updates, increment both `package.json`
and `src/manifest.json`. Upload the generated ZIP to each store and the listing
images separately. Store approval and developer-account setup are manual.

## License

MIT — see `LICENSE`.

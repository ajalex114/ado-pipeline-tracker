# ADO Pipeline Tracker - Product & Technical Spec (v1)

## 1. Summary
ADO Pipeline Tracker is a Microsoft Edge browser extension that tracks **specific Azure DevOps build runs** (not whole pipelines), shows live progress, and notifies users on stage/pipeline state changes and failures.

Users can:
1. Add a build-run link explicitly.
2. Use a keyboard shortcut on an ADO build page to instantly start tracking that build.
3. Click a popup action to track the current build when they are on an ADO build-run page.
4. Receive desktop notifications for configured events.

## 2. Goals
- Track any ADO build run the user has access to across projects.
- Show near-real-time status using 30-second polling.
- Notify on stage and pipeline transitions with deduplication.
- Keep a 7-day local event history.
- Continue tracking independent of the originating browser tab lifecycle.

## 3. Non-Goals (v1)
- Mobile companion app.
- Release pipeline support.
- Credential/token storage in extension.
- Auto-tracking all builds in a pipeline.

## 4. Scope Decisions from Interview
| Area | Decision |
| --- | --- |
| Browser | Microsoft Edge |
| ADO auth | Use existing browser ADO signed-in session |
| Tracking unit | **Build run URL only** (explicit add) |
| Pipeline types | Build pipelines (YAML + classic) |
| Polling interval | 30 seconds |
| Notification channel | Desktop notifications |
| Notification trigger set | User-configurable |
| Deduplication | Once per unique state transition |
| UI | Toolbar popup + settings page |
| Stack | TypeScript + React + Vite |
| Active tracking cap | 20 build runs |
| Build lifecycle | Auto-stop when run reaches terminal state; retain in 7-day history |
| Shortcut | Default shortcut provided; user can change via browser shortcut settings |

## 5. User Stories
- As a user, I can paste an ADO build-run link and start tracking it.
- As a user on an ADO build page, I can press a shortcut and immediately track that run.
- As a user on an ADO build page, I can click a popup button to track the current build.
- As a user, I receive desktop notifications when configured stage/pipeline events happen.
- As a user, I can see active tracked runs and recent history in the extension UI.
- As a user, I can control which event types generate notifications.

## 6. Functional Requirements

### 6.1 Build-run onboarding
- Accept only run-level URLs (e.g., links containing build run identifiers).
- Reject pipeline-definition links with a clear validation message.
- Prevent duplicates for already-tracked active runs.
- Provide a "Track Current Build" action in popup when current tab URL is a valid ADO build-run page.
- Hide or disable "Track Current Build" with helper text when current tab is not a valid build-run page.
- Open the popup after a successful shortcut add and briefly highlight the new row.

### 6.2 Tracking engine
- Poll each active build run every 30 seconds.
- Fetch:
  - Pipeline run overall status/result/state.
  - Stage-level status/state transitions.
- Tracking must be independent of the source tab: closing or navigating away from the original build tab must not stop tracking.
- Enforce max 20 active tracked runs.
- Auto-stop tracking when run is terminal: Succeeded, PartiallySucceeded, Failed, or Canceled.

### 6.3 Notifications
- Use browser desktop notifications.
- Trigger on user-selected events (at least: stage transition, pipeline completion, pipeline failure).
- Deduplicate by `(runId, stageId?, transitionType, terminalState?)`.
- Include deep link to run in notification payload.

### 6.4 UI
- **Popup**
  - Active tracked runs list (name, project, current stage/status, last update time).
  - Stage progress view per tracked run (stages grouped by completed, active, failed states).
  - Quick add build link.
  - "Track Current Build" button when user is on a valid ADO build-run page.
  - Remove tracked run.
  - Recent history preview.
  - Data is visible regardless of current active browser tab/page.
- **Settings page**
  - Notification event toggles.
  - Shortcut instructions (and pointer to browser shortcut settings).
  - History retention display (fixed 7 days in v1).

### 6.5 History
- Persist event history for 7 days.
- Auto-prune expired entries.
- Store non-sensitive metadata only.

## 7. Technical Design

### 7.1 Architecture
- Manifest V3 Edge extension.
- Components:
  - Background service worker: polling, ADO API calls, dedupe, notification dispatch.
  - Popup React UI.
  - Settings React UI.
  - Optional content/context integration for shortcut-based run detection from current ADO page URL.

### 7.2 Data model (local storage)
- `trackedRuns`:
  - `runId`, `org`, `project`, `buildDefinitionId`, `runUrl`, `displayName`
  - `state`, `result`, `lastPolledAt`, `isActive`, `addedAt`
- `runStateCache`:
  - Last seen stage/pipeline state fingerprints for transition detection.
- `eventHistory`:
  - `eventId`, `runId`, `stageId?`, `eventType`, `fromState`, `toState`, `createdAt`, `notified`
- `settings`:
  - Notification toggles by event type.

### 7.3 ADO integration
- Use Azure DevOps REST APIs over existing signed-in browser session.
- Required data:
  - Build run detail/state.
  - Timeline/stages/jobs for stage transitions.
- Handle permission failures (401/403) with user-visible error state for affected run.

### 7.4 Polling and transition detection
- Every 30 seconds:
  1. Load active tracked runs.
  2. Fetch latest run + timeline state.
  3. Compare against cached prior state.
  4. Emit transition events.
  5. Notify per user config and dedupe rules.
  6. If terminal, mark inactive and move to history.

## 8. Permissions & Security
- Use minimum required permissions:
  - `notifications`
  - `storage`
  - ADO host permissions for API access.
- Do not store credentials/PATs.
- Store metadata only (run identifiers, statuses, timestamps, URLs).

## 9. Error Handling
- Invalid link: reject with run-level URL guidance.
- Inaccessible run (permission/org mismatch): show actionable error and pause/remove tracking option.
- API transient failure: retry on next polling cycle; do not duplicate notifications.

## 10. Implementation Milestones
1. Project scaffold (TypeScript + React + Vite, MV3 manifest).
2. Core storage and settings model.
3. Manual build-run add/remove and validation.
4. Polling engine + transition detector.
5. Desktop notification pipeline with dedupe.
6. Shortcut-triggered add from ADO build page.
7. Popup and settings UI polish.
8. Retention pruning + final QA.

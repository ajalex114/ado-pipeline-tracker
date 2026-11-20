# ADO Pipeline Tracker - Behavior Document

This document is the canonical behavior reference for the extension.  
Any behavior change must update this document in the same change.

## 1. Scope behavior

- Tracks **specific Azure DevOps build-run links** only (not pipeline-definition links).
- Supports build pipelines (YAML + classic) for runs the signed-in user can access.

## 2. Tracking lifecycle behavior

- User can add a build-run link manually from extension UI.
- User can use keyboard shortcut on ADO build-run page to instantly start tracking that run.
- When extension popup is opened on an ADO build-run page, user can click "Track Current Build" to start tracking that run.
- When a new build is added (shortcut, current tab, or pasted URL), the extension opens its popup inside Edge and highlights the newly tracked build. Adding a duplicate does not reopen the popup.
- Popup opening is best-effort: if Edge cannot open it, tracking remains saved and the highlight is shown on the next popup open. This confirmation is independent of finish-notification settings.
- Tracking continues in background even if the originating build tab is closed or user navigates away.
- Active tracking is capped at 20 runs.
- Polling occurs every 30 seconds for active tracked runs.
- Tracking auto-stops when run reaches terminal state (Succeeded, PartiallySucceeded, Failed, Canceled).
- A finished run is reactivated when a manual refresh shows it running again (e.g. rerun from Azure DevOps).

## 2a. Rerun behavior

- A finished build with result Failed, PartiallySucceeded, or Canceled offers "Rerun failed jobs" (ADO `PATCH builds/{id}?retry=true`), which reruns only its failed/canceled jobs.
- A completed stage with result Failed, PartiallySucceeded, or Canceled that has an ADO reference name offers "Retry" (ADO Stages - Update, `state: retry`, failed jobs only).
- Azure DevOps does not support rerunning individual tasks; jobs are the finest rerun unit.
- On a successful rerun request the run becomes active again, shows as Queued, and displays "Rerun requested — waiting for Azure DevOps…".
- While a rerun is pending, a stale terminal status from the previous attempt does not auto-stop the run; the wait ends when ADO reports a running state or a higher attempt, or after 3 minutes.
- Rerun actions are hidden while a rerun is pending. ADO rejections (e.g. missing permissions) are shown inline on the card and the run stays as it was.

## 3. Notification behavior

- Desktop notifications are used.
- Stage and build desktop notification icons reflect the event result: a red cross for failure, green check for success, amber exclamation mark for partial success, and gray cancellation symbol for canceled results. Events without a result retain the extension icon.
- Notification categories are user-configurable in settings.
- Notifications are deduplicated and emitted once per unique state transition.
- A notification is emitted when a tracked build finishes: "Build completed" (Succeeded / Partially succeeded) or "Build failed" (Failed / Canceled); the message includes the result and build name.
- Each rerun attempt is a new transition: a build or stage that finishes again after a rerun notifies again (dedupe keys include the attempt number when > 1).

## 3a. In-browser alert behavior

- In addition to desktop notifications, a tracked build finishing (observed by background polling or a manual refresh) triggers in-browser alerts. Builds already finished when added do not.
- Toolbar badge (setting "Badge on toolbar icon", default on): shows the number of finished builds not yet viewed (max "9+"); red if any failed, amber if any canceled/partially succeeded, otherwise green. A build that finishes again after a rerun is counted once, with its latest result.
- The badge clears when the popup is opened; untracking a build removes it from the count. The badge is restored on browser startup.
- The badge is only visible when the extension is pinned to the toolbar.
- Auto-open popup (setting "Open popup when a build finishes", default on): opens the popup with the finished build highlighted. If it cannot open (e.g. no focused Edge window), the badge still signals the result.
- Badge and auto-open are independent of the desktop notification toggles.

## 4. History behavior

- Keep a local 7-day event history.
- Prune events older than retention window.

## 5. Progress visibility behavior

- Popup shows tracked build progress from any current browser page/tab context.
- For each tracked run, popup shows stage-level progress with clear completed/active/failed state indicators.
- Active approval checkpoints and running ManualValidation/ManualIntervention tasks highlight the build card in amber with "Waiting for approval" or "Waiting for review", including the affected stage when available and a link to respond in Azure DevOps. Both labels are combined if needed.
- Waiting builds show a prominent "Review in Azure DevOps" button directly below the waiting message, above the stage list. It opens that build's existing URL in a new tab; approving or rejecting is performed in Azure DevOps, not by the extension. The button disappears when the wait clears, the build finishes, or a rerun is requested.
- Ordinary queued stages/tasks and generic automated checks are not labeled as human waits. Completed approvals/tasks and completed ancestors are ignored; terminal builds and requested reruns clear the highlight.
- Timeline attempt counters belong to individual records and are not compared across stages, jobs, tasks, or approvals. An active approval or manual review remains visible even when its attempt counter is lower than its parent stage's counter.
- Timeline fetch failures show an inline error and retain the last known progress/wait state until a successful refresh (or terminal build result) clears it. Reviewers, approval instructions, and other personal payloads are not stored.

## 6. UI/UX behavior

- Popup is the primary surface: "Track Current Build" action, add-by-URL bar, active builds, recently finished, and recent events.
- "Track Current Build" is enabled only when the active tab is a valid ADO build-run URL; otherwise it is disabled with guidance text.
- The newly tracked build is briefly highlighted in the popup after a successful shortcut/add action.
- Status is shown via color-coded chips: Queued/Running (neutral/blue), Succeeded (green), Failed (red), Partial/Canceled (amber).
- Add-by-URL validates input; invalid or pipeline-definition links produce an inline, actionable error.
- Notifications use short, actionable copy; clicking a notification opens the build run in a new tab.
- UI auto-refreshes while open and offers a manual Refresh action.
- Each build card has a ⟳ refresh button that immediately re-fetches that build from Azure DevOps (active or finished); fetch errors are shown inline on the card.
- Accessibility: keyboard-operable controls, visible focus outlines, ARIA labels on icon-only controls, and light/dark theme support.

## 7. Browser lifecycle behavior

- Tracking runs in the background service worker driven by chrome.alarms, independent of any tab.
- While the browser is fully closed, no polling or notifications occur (the extension runtime is not running).
- On browser startup, the extension resumes tracking previously active builds and polls immediately; transitions that completed while closed are reconciled on the next poll.

## 8. Privacy and security behavior

- Use existing browser ADO session for auth.
- Do not store credentials or tokens.
- Store only non-sensitive metadata needed for tracking and UX.
- Logs must not include sensitive information.

## 9. Error behavior

- Invalid/non-run links are rejected with actionable validation feedback.
- If popup is opened outside a valid build-run page, "Track Current Build" is disabled or hidden with guidance.
- Access/API failures are surfaced without exposing sensitive details (e.g., 401/403 shows an access/sign-in message).
- Transient polling errors recover on subsequent cycles; the run stays active and is retried.

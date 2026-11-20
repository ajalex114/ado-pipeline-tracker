# ADO Pipeline Tracker - Interview Memory

## Q1
**Question:** Which browser should v1 target?
**Response:** Microsoft Edge.

## Q2
**Question:** Which ADO scope should v1 support?
**Response:** User should be able to monitor any pipelines they have access to, across projects and pipelines.

## Q3
**Question:** Authentication approach for v1?
**Response:** Use existing browser Azure DevOps sign-in session.

## Q4
**Question:** Notification channels for v1?
**Response:** Browser desktop notifications only.

## Q5
**Question:** Pipeline status polling frequency?
**Response:** Every 30 seconds.

## Q6
**Question:** How users choose monitored pipelines?
**Response:** Manually select and save favorite pipelines.

## Q7
**Question:** Which events should trigger notifications by default?
**Response:** Make this user-configurable in the extension settings, instead of fixing one default-only rule.

## Q8
**Question:** What UI should v1 include?
**Response:** Toolbar popup with monitored pipelines, plus a separate settings page.

## Q9
**Question:** Implementation stack preference?
**Response:** TypeScript + React + Vite.

## Q10
**Question:** Should v1 keep an event/history log?
**Response:** Yes, keep last 7 days of events.

## Q11
**Question:** How should duplicate notifications be handled?
**Response:** Notify once per unique state transition.

## Q12
**Question:** Which ADO pipeline types should v1 support?
**Response:** Build pipelines only (YAML + classic).

## Q13
**Question:** Privacy/security requirement for local storage?
**Response:** Store only non-sensitive metadata locally; never store credentials.

## Q14
**Question:** Priority v1 non-goal?
**Response:** No mobile companion app yet.

## Q15 (Freeform)
**Question:** Any tangential/freeform ideas before drafting spec?
**Response:** Add keyboard shortcut support when user is on an Azure DevOps build page to quickly start tracking that build. Clarification: track specific build links (run-level) only, not pipeline links; users must explicitly add a build link to avoid noise. Asked assistant to continue with more questions as needed.

## Q16
**Question:** What should happen after keyboard shortcut is pressed on a build page?
**Response:** Instantly add current build-run URL and start tracking.

## Q17
**Question:** Should tracking auto-stop when build reaches terminal state?
**Response:** Yes, auto-stop and keep it in 7-day history.

## Q18
**Question:** Should there be a cap on simultaneously active tracked builds?
**Response:** Yes, cap at 20 active tracked builds.

## Q19
**Question:** Shortcut preference for v1?
**Response:** Provide a hardcoded default shortcut, and let users change it via browser extension shortcut settings.

## Q20
**Question:** Additional UI/UX tracking action on build page?
**Response:** When user opens/activates the extension while on a build page, popup should show a button to track the current build.

## Q21
**Question:** What happens if tracked build tab is closed or user navigates away?
**Response:** Tracking must continue in background even after tab close/navigation. When popup is opened from any page, user should still see tracked build progress, including stage-level status (completed/failed/active).

## Q22
**Question:** What happens if the user closes the entire browser?
**Response:** Clarified that tracking stops while the browser is fully closed (extension runtime is not active). On browser reopen, the extension resumes from saved tracked builds and reconciles state on the next poll; it cannot notify for events that occurred while closed.

## Q23
**Question:** Should there be a popup "Track Current Build" button (in addition to the shortcut)?
**Response:** Yes. When the extension popup is opened while on a valid ADO build-run page, show a "Track Current Build" button; disable/hide with guidance when not on a build-run page.

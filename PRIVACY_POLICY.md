# Privacy Policy

**ADO Pipeline Tracker - Chrome and Microsoft Edge extension**

Last updated: November 20, 2026

## Overview

ADO Pipeline Tracker monitors specific Azure DevOps build runs that you choose.
It displays build and stage progress, sends notifications, and lets you request
retries in Azure DevOps. This policy describes the extension, not Microsoft
Azure DevOps, GitHub, or the browser extension stores.

## Information accessed and stored

The extension reads the current tab's URL to recognize an Azure DevOps build-run
page when you open the popup or use the tracking shortcut. It does not record
your general browsing history, read page contents, or monitor unrelated tabs.

For builds you choose to track, the extension retrieves Azure DevOps build and
timeline metadata. It stores the following in `chrome.storage.local` in your
browser profile:

- Build-run URLs and IDs, organization and project names, and build display names.
- Build and stage status, stage names and reference names, retry attempts, and
  polling timestamps.
- Pending approval or manual-review identifiers and their stage associations,
  without reviewer profiles or approval instructions.
- Recent transition events, notification deduplication state, unread-finish
  indicators, and notification and diagnostic settings.

These names and URLs can contain confidential organizational information. The
extension uses them only to provide its build-tracking functionality. It does
not send this locally stored information to the developer or an analytics service,
and does not use browser storage sync.

## Network requests and authentication

The extension contacts the Azure DevOps organizations you choose under
`https://dev.azure.com/` or `https://*.visualstudio.com/`. Background polling
continues while the browser is running, even if the build tab has been closed.
Tracking stops when a terminal build result is observed or you remove the build.
Manually refreshing a build also contacts Azure DevOps. Retry actions send a
request to Azure DevOps to rerun failed jobs or retry a stage.

Requests use your existing signed-in Azure DevOps browser session. The browser
may attach its session cookies to authenticate these requests. The extension
does not request passwords or personal access tokens, read cookies through the
cookies API, or separately store authentication credentials.

Azure DevOps receives these requests, including normal network information such
as your IP address, under Microsoft's own terms and
[privacy statement](https://privacy.microsoft.com/privacystatement).

## Notifications and diagnostics

Desktop notifications may show build names, stage names, and results through your
operating system's notification service. They may be visible on a shared screen
or lock screen, depending on your system settings. You can turn off each
notification category in the extension's Settings.

The extension writes operational diagnostics to the local browser console.
These can include build IDs, run identifiers, operation names, results, error
categories, and timestamps. Sensitive credential-related keys are redacted.
Usage counters are held in memory; debug-level metric events are written only
to the local console. No analytics, advertising, crash-reporting, or telemetry
endpoint receives this data. Review console exports before sharing them.

## Retention and deletion

- Build records and settings remain locally until you remove them or uninstall
  the extension; finished build records do not expire automatically.
- Event history uses a seven-day retention window and is pruned during normal
  extension operation. Settings includes a **Clear event history** action.
- Removing a tracked build removes its build record and unread-finish indicator;
  its past events may remain until history is cleared or pruned.
- Uninstalling the extension removes its extension-local storage through the
  browser. Existing operating-system notifications or manually exported logs
  may require separate deletion.

## Permissions

| Permission               | Purpose                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `storage`                | Keep tracked build metadata, settings, and recent events locally.                                    |
| `notifications`          | Display build and stage completion or failure alerts and open the relevant build when clicked.       |
| `alarms`                 | Schedule background polling while the browser is running.                                            |
| `tabs`                   | Read the active tab URL for tracking actions and open selected Azure DevOps build links.             |
| Azure DevOps host access | Read build and timeline status and perform explicitly requested retries using your existing session. |

## Data sharing and limited use

The developer does not receive, sell, rent, or share your tracked build data.
The extension does not use it for advertising, creditworthiness, or purposes
unrelated to build tracking. There is no developer-operated backend or remote
executable code. User data is used only to deliver the extension's single
purpose and in accordance with the Chrome Web Store User Data Policy, including
its Limited Use requirements.

If you choose to open the project's support or privacy links, your browser will
contact GitHub under GitHub's privacy policy. Do not include private build URLs,
credentials, organizational data, or raw diagnostic captures in public issues.

## Changes and contact

Updates to this policy will be published here with a revised date. For privacy
questions, open an issue without sensitive details at
[the project repository](https://github.com/ajalex114/ado-pipeline-tracker/issues).

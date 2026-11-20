# Store submission reference

Prepared for Chrome Web Store and Microsoft Edge Add-ons. No submission is
performed by the repository scripts.

## Listing fields

- **Name:** ADO Pipeline Tracker
- **Category:** Developer Tools (or the closest available developer category).
- **Language:** English.
- **Website:** https://github.com/ajalex114/ado-pipeline-tracker
- **Support:** https://github.com/ajalex114/ado-pipeline-tracker/issues
- **Privacy policy:** https://github.com/ajalex114/ado-pipeline-tracker/blob/main/PRIVACY_POLICY.md
- **Short description:** Track Azure DevOps build runs with live stage progress and desktop notifications on completion or failure.
- **Single purpose:** Track user-selected Azure DevOps build runs and notify the user of build and stage results, with progress and retry controls.
- **Edge search terms:** Azure DevOps; build tracker; pipeline notifications; CI CD; stage progress; build alerts

### Full description (copy into either store)

Keep an eye on your Azure DevOps builds without keeping every build tab open.
ADO Pipeline Tracker follows the specific build runs you choose, shows their
stage progress, and alerts you when stages or builds finish.

TRACK THE RUNS THAT MATTER

- Paste an Azure DevOps build-run URL, use Track Current Build, or press Alt+Shift+T.
- Track up to 20 active runs from your browser toolbar.
- Continue tracking in the background while your browser is running, even after
  closing the original build tab.

UNDERSTAND THE RESULT

- See stage-by-stage progress and clear success, failure, partial, and canceled states.
- Receive result-specific desktop notifications and a toolbar badge.
- Identify builds waiting for approval or manual review and open them in Azure DevOps.
- Open a build directly, rerun failed jobs, or retry an eligible failed stage.
  Retry actions require the appropriate Azure DevOps permissions.

CONTROL YOUR ALERTS

- Enable or disable stage and build notifications separately.
- Choose whether completed builds open the popup or update the toolbar badge.
- Review recent events and clear local event history in Settings.
- Use light or dark mode with keyboard-operable controls.

YOUR EXISTING AZURE DEVOPS SESSION
Sign in to Azure DevOps in the same browser profile. No personal access token or
separate extension account is required. Build metadata and settings are kept
locally; there is no developer-operated backend, advertising, or remote analytics.
Requests go to the Azure DevOps organizations whose builds you choose to track.

Requires Chrome or Chromium-based Microsoft Edge version 116 or later and access
to the selected Azure DevOps builds. Browser notification permissions and system
settings can affect alerts. Background polling pauses when the browser is fully
closed. Automatic popup opening is best-effort and depends on browser support.

Independent project; not affiliated with or endorsed by Microsoft or Google.
Azure DevOps, Microsoft Edge, and Chrome are trademarks of their respective owners.

## Privacy dashboard and permission justifications

Use the published privacy policy as the source of truth; review the live
dashboard's definitions before certifying disclosures. Do not copy the other
extension's "no storage" or "no cookies" statements: this extension stores build
metadata locally and uses browser-managed Azure DevOps session authentication.

| Requested access               | Justification                                                                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                      | Persist user-selected build metadata, settings, deduplication state, and seven-day event history in extension-local storage.                                                                       |
| `notifications`                | Alert the user to build and stage results, using result-specific icons; clicking opens the corresponding tracked build.                                                                            |
| `alarms`                       | Poll tracked builds periodically while the browser is running without requiring their tabs to remain open.                                                                                         |
| `tabs`                         | Read the active tab URL when the popup opens or a tracking action is invoked, so the extension can identify a build-run link. It does not record general browsing history. Also opens build links. |
| `https://dev.azure.com/*`      | Read build and timeline metadata and send user-requested retry requests for user-selected Azure DevOps organizations, using their signed-in session.                                               |
| `https://*.visualstudio.com/*` | Support the same functionality for Azure DevOps organizations that use legacy visualstudio.com collection URLs.                                                                                    |
| Remote code                    | No. All executable JavaScript is bundled in the uploaded package. API JSON responses are data, not executable code.                                                                                |

The extension handles **website content** (build/stage names and results) and
**web history data limited to selected/active build URLs**, not general browsing
history. Treat build/project/organization names and URLs as potentially sensitive.
Data is processed locally and exchanged only with the chosen Azure DevOps service;
it is not sent to the developer or an analytics endpoint. Disclose these data
types wherever the store asks about data accessed, used, collected, or transmitted;
do not equate "no developer backend" with "no user data handled". The extension
does not collect passwords, tokens, payment details, location, or personal
communications. Session authentication is browser-managed, as explained in the policy.

Certify the no-sale, single-purpose, no-creditworthiness, and Limited Use statements
only after checking the final uploaded version. Both stores may ask for additional
data-use or developer-account declarations; answer those yourself.

## Assets

All listing images are generated locally from the project's branding and fictional
fixtures. Screenshots render the actual built UI in a fresh Playwright browser
context with external requests blocked. No existing browser profile, Azure DevOps
account, browser capture, or real deployment data is used.

| File under `store/assets/`         | Size       | Upload field                                             |
| ---------------------------------- | ---------- | -------------------------------------------------------- |
| `logo_128x128.png`                 | 128 x 128  | Chrome store icon                                        |
| `logo_300x300.png`                 | 300 x 300  | Edge extension logo                                      |
| `promo_small_440x280.png`          | 440 x 280  | Small promotional tile, both stores                      |
| `promo_large_1400x560.png`         | 1400 x 560 | Chrome marquee / Edge large promotional tile             |
| `screenshot_progress_1280x800.png` | 1280 x 800 | Actual popup UI with fictional running and failed builds |
| `screenshot_review_1280x800.png`   | 1280 x 800 | Actual popup UI with fictional approval wait             |
| `screenshot_settings_1280x800.png` | 1280 x 800 | Actual Settings UI with default preferences              |

The manifest uses PNG icons at 16, 32, 48, and 128 pixels under `public/icons/`.
The 128-pixel icon uses 16 pixels of transparent padding around 96-pixel artwork,
following Chrome's square-icon guidance. The SVG under `store/branding/` is the
editable source, not a runtime dependency.

To regenerate images after UI changes:

```bash
npx playwright install chromium
npm run store:assets
```

## Build and upload

```bash
npm ci --registry=https://registry.npmjs.org
npm run lint
npm test
npm run package
```

Upload `release/ado-pipeline-tracker-1.0.0.zip` to each store. The version in the
filename follows the manifest version. The ZIP has `manifest.json` at its root
and includes only the extension's runtime files, not source maps, screenshots,
build fixtures, browser captures, source code, or `node_modules/`.

Before submitting:

1. Commit and push the privacy policy and assets so the privacy URL is public and
   accessible without signing in. Check that URL before entering it in each store.
2. Load the packaged files unpacked in clean Chrome and Edge profiles and smoke-test
   tracking and notifications using a non-sensitive test organization. Never use
   private production data for store screenshots or reviewer access.
3. Use your own registered Chrome Web Store and Edge Partner Center developer
   accounts. Complete any registration, verification, fees, and distribution fields.
4. Upload the ZIP, copy the listing and privacy fields, and upload the PNG assets.
5. If reviewers require access, provision a dedicated least-privilege demo account
   in a non-sensitive organization and provide details only in the store's private
   reviewer-notes field. Never put credentials in this repository or public listing.
6. Submit for review. Approval and publication are controlled by each store; these
   materials do not guarantee approval. Increment both package and manifest versions
   for subsequent store releases; keep 1.0.0 for the initial submission if unused.

### Suggested reviewer notes

This extension requires an Azure DevOps session in the same browser profile and
access to at least one build run. It does not provide an independent login form.
Sign in to a non-sensitive test organization, open a build run whose URL contains
`buildId`, then open the extension and choose Track Current Build. Verify stage
progress, manually refresh, and observe a completion notification as the run ends.
Open Settings to configure categories and clear history. Pin the extension to see
its unread-finish badge. For a failed build, retry controls depend on Azure DevOps
permissions. Closing the build tab does not stop tracking; closing the browser does
pause polling. Listing screenshots use fictional data and do not represent a live
customer deployment. Add private test-access instructions here if requested by the
review team; no test credentials are included in the repository.

## Official requirements checked

- [Chrome store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Chrome image requirements](https://developer.chrome.com/docs/webstore/images)
- [Chrome User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)

Checked November 20, 2026. Recheck the live dashboards when submitting.

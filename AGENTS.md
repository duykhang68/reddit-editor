# Repository instructions — `duykhang68/tetdinhmuiblog`

These instructions apply to **all files and every coding agent/PR** in this repository.

## Mandatory rule: Google Drive sync for data-oriented pages

**NON-NEGOTIABLE / BẮT BUỘC:** Every page, dashboard, utility, or sub-page that displays, manages, records, edits, imports, exports, or analyzes **statistics/analytics (thống kê), expenses/finance (chi phí/tài chính), or datasets/records (dữ liệu)** MUST integrate **Google Drive synchronization**. Applies to **existing pages when modified** and **every newly created relevant page**. Do not ship such a page with only localStorage, in-memory state, or Cloudflare-only storage.

For the authoritative acceptance criteria, consult [docs/GLOBAL-GOOGLE-DRIVE-SYNC-POLICY.md](docs/GLOBAL-GOOGLE-DRIVE-SYNC-POLICY.md) before modifying a data-oriented page.

Required capabilities:
1. **Shared Google OAuth:** Reuse the Editor's existing Web OAuth Client ID discovery (prefer `VITE_GOOGLE_CLIENT_ID`, fall back to its established safe configuration). Use Drive's minimum required permission (`drive.file`) and never put Client Secrets or tokens in source/localStorage.
2. **Automatic sync every 3 minutes:** When the page is open, online, and its Drive session is valid, synchronize at least once every **180 seconds**; queue/persist edits safely. Do not claim background synchronization while the tab is closed.
3. **Manual “Đồng bộ ngay” action:** An obvious button to sync now, with clear connected/syncing/synced/pending/error status, latest successful sync time, and an accessible link to the backup when available.
4. **Cross-device restore:** Signing in with the same Drive account on a different browser/device can restore the corresponding page's data, filters/preferences and relevant persisted settings as appropriate.
5. **Integrity + conflict safety:** Do not silently overwrite or delete different local/remote versions. Validate/normalize snapshots; compare account and revisions/snapshot ancestry; require explicit conflict resolution and preserve/export a backup before any destructive replacement. Avoid duplicate records on retry.
6. **Independent datasets:** Each page/module MUST use its own Drive appProperties tag, filename convention, snapshot schema/version, and local sync metadata key, unless explicitly designed and documented as one shared dataset. Never mix Starbucks transactions with Expenses or other pages.
7. **Preserve complete data:** Back up all meaningful fields including source/original values, amounts before/after discounts, surcharges, descriptive reasons, identifiers, and relevant dashboard settings. Never back up only currently visible/filtered rows.
8. **Tests and documentation:** Add/maintain automated tests for upload, read-back verification, restore on a new device, concurrent edit conflict, OAuth expiry, and dataset isolation. Update the corresponding setup docs. **1 feature = 1 PR**.

This requirement also covers read-only statistical dashboards: offer a meaningful Google Drive backup/sync of their dashboard datasets, saved settings, or snapshots. Do not silently exempt pages merely because data comes from a public API/GitHub; if a legitimate technical exception is necessary, obtain the owner's explicit approval and document it in the PR.

Do **not** replace Google Drive with Cloudflare D1/KV, GitHub, or browser storage as the sole backup source. Such sources may coexist, but Drive sync remains mandatory.

## Existing pages

The mandate is repository-wide, but **adding this policy does not itself retrofit legacy pages**. Audit and migrate each existing in-scope page with a separate feature/PR and track remaining gaps in the policy document. Do not claim a page is compliant until code, tests and live configuration have been verified.

## Mandatory rule: Editor Quick Access shortcuts for new utilities

**NON-NEGOTIABLE / BẮT BUỘC:** Every newly built utility, standalone tool, dashboard, insights page or feature with its own navigable URL/route MUST have a working shortcut in the Editor's **“Truy cập nhanh”** section as part of the **same feature PR**. The owner must never have to remember or manually type the URL.

Acceptance criteria:
1. Add a clear Vietnamese label and the canonical production URL/route to the existing Editor Quick Access data/UI; do not create a separate disconnected shortcut list.
2. The shortcut must be visible and clickable from the Editor, navigate to the correct deployed page, and work on desktop and mobile. External URLs must use safe link behavior.
3. Deduplicate by canonical normalized URL/route; preserve all existing shortcuts, their labels, ordering and functionality. Prefer the repository's established Quick Access implementation/pattern.
4. Include an automated test or equivalent regression check for the shortcut and route; verify that the link resolves to the intended page after deployment.
5. Add the shortcut in the **same commit/PR workflow** that builds the new utility; PRs without it are **BLOCKED / NON-COMPLIANT**. Explicitly document exceptions (e.g. a non-navigable internal component) in the PR.
6. Keep the existing Editor layout and light-mode styling unchanged outside the minimum necessary shortcut addition.

This rule applies prospectively to new utilities; existing utility shortcuts may be audited or backfilled in separate scoped PRs.

## Mandatory rule: reuse the Editor's Google OAuth configuration on every page

**NON-NEGOTIABLE / BẮT BUỘC:** All tools, dashboards, standalone pages and new features on the Editor domain that connect to Google Drive, Sheets or other Google APIs MUST reuse the Editor's established Google OAuth Web Client ID discovery. Do not ask the owner to configure `VITE_GOOGLE_CLIENT_ID` independently for each page.

Acceptance criteria:
1. Use the shared `discoverExpenseDriveClientId` helper (or its centralized successor) in `apps/web/src/expenses/driveClientResolver.js`, with the Editor's `EDITOR_DRIVE_CLIENT_KEY`. Its precedence covers existing `VITE_GOOGLE_CLIENT_ID`, remembered same-origin public Client ID, and the server's public `/api/drive-client-config` endpoint (`GOOGLE_DRIVE_CLIENT_ID` then `GOOGLE_CLIENT_ID`).
2. Resolve the ID at page mount, before the user clicks Google Sign-In, to avoid popup blockers. Never duplicate configuration screens for already connected Editor OAuth settings. Display actionable error states only if all safe discovery sources fail.
3. Reusing the public Web Client ID does **not** reuse an OAuth access token or automatically grant access. Request only the scopes the page actually needs via Google Identity Services; support consent, denial and expiration.
4. Never expose Google Client Secret, service account private keys, access or refresh tokens in source, localStorage, public endpoints, error logs or GitHub. The public OAuth Client ID is not secret. `GOOGLE_SERVICE_ACCOUNT_JSON` is server-only and not a browser OAuth substitute.
5. Add regression tests proving reuse works when a new page's build-time `VITE_GOOGLE_CLIENT_ID` is absent, but the Editor's stored or backend Client ID exists. Do not break any existing Drive sync, data isolation, conflict protection, or approved layout.

## Optional on-device storage of AI provider API keys

For user-entered Gemini/Groq API keys, do not persist by default. Where an explicit **“Lưu API keys trên thiết bị này”** preference exists, allow a deliberate per-device opt-in and an easy clear/revoke control. Explain that browser localStorage is not encrypted, can be read by browser extensions or anyone with access to that browser, and is never synced to Drive, Sheets or server. Never store Google OAuth tokens or service account keys this way. Do not log or commit user keys. Prefer server-side secrets/proxy for shared devices and sensitive production use.

## Other engineering conventions

- Never commit credentials or private user data.
- Prefer existing `apps/web/src/services/googleDriveService.js` and patterns in `apps/web/src/expenses/` and `apps/web/src/starbucks-insights/` over creating a new OAuth stack.
- Maintain accessible, responsive **Reddit-inspired light mode** unless the owner explicitly requests otherwise; avoid changing unrelated layouts or approved behavior.
- Follow the project's CI quality gate and keep changes scoped to one feature per PR.

## Mandatory rule: avoid repetitive Google OAuth prompts on trusted browsers

**BẮT BUỘC:** Every Editor utility using Google Drive, Sheets or another Google API must reuse the common Web Client ID and previously granted Google permissions whenever Google Identity Services allows it. On the same origin/browser, changing routes, refreshing or reopening a tool must NOT deliberately force an account chooser or consent dialog on every connection.

- Prefer `requestAccessToken({prompt: ''})` after the configured Client ID and the minimum scopes have been determined. Never force `prompt: 'consent'` or `prompt: 'select_account'` on routine connections. Provide an explicit **Đổi tài khoản** action for deliberate account switching.
- Reuse active in-memory credentials across components when their client ID, account and scopes are compatible; avoid parallel login popups. Google may still require fresh interaction after token expiration, revocation, new scopes or browser cookie restrictions. Do not claim indefinite silent login.
- Persist only **non-secret** OAuth configuration, account hints and UI preferences on the device. **Never** persist access/refresh tokens in localStorage, sessionStorage, IndexedDB, URLs, source or logs. Use server-side encrypted secure session cookies if durable automatic renewal is a future requirement; implement CSRF protection, bounded lifetimes and explicit logout.
- Authenticate each API call with the appropriate scopes, recover from HTTP 401/403 without deleting user data, and offer clear reconnect/logout messages. Explicit disconnect must invalidate local runtime credentials.
- Add tests verifying no forced consent on ordinary reconnect, explicit account-switch behavior, missing scopes and expired/revoked sessions. Apply across all existing and future utility pages without changing approved UI layouts.


## Mandatory CI hotfix lesson — PR #115 (2026-11-08)

**Root cause:** The Cloudflare Pages handler at `apps/web/functions/[[path]].js` contained an over-escaped JavaScript regular-expression literal in the Blogger post PATCH/DELETE route. `/^\\\\/api\\\\/posts\\\\/\\\\d+$/` was produced by nested string/template escaping and caused `SyntaxError: Invalid regular expression flags`. This single parser error made four independent-looking test files fail at import time, and skipped the production build.

**Preventative rules for every future JavaScript/TypeScript PR, especially generated code:**
1. Write regex literals directly in the destination file. In actual JS source, the valid post route pattern is `/^\\/api\\/posts\\/\\d+$/`; never commit the doubly escaped form.
2. Before running an extensive suite, execute `node --check 'apps/web/functions/[[path]].js'` and `node --check apps/server/index.mjs` (plus check other touched `.js/.mjs` files). Where JSX is touched, run `npm run build` to catch Vite/React parse errors.
3. On CI failures, inspect the **first syntax/runtime exception**, not just the count of failing tests. Multiple failures importing the same broken module typically share one root cause.
4. Add a minimal regression test for new or changed routing expressions, and run the repository's exact locked-dependency CI commands before merge. A green parse check is necessary but not sufficient: retain full tests, production build and Cloudflare checks.
5. Never merge on a failed or pending Quality Gate; recheck the **newest commit SHA**, not an older run.
6. For destructive Blogger operations, keep a verified Drive backup and explicit human confirmation; do not use test runs to delete real posts.

Incident record: `docs/researcher/incidents/pr-115-overescaped-route-regex-2026-11-08.md`.

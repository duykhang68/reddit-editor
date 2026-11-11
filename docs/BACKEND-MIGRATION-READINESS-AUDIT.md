# Backend Readiness Audit & Safe Migration Plan

**Scope:** `duykhang68/reddit-editor` (GitHub Pages static preview + existing Cloudflare production)  
**Audit date:** 2026-11-11 (Asia/Ho_Chi_Minh)  
**Audit method:** Source inspection on GitHub `main` plus **read-only** Cloudflare Pages, Worker and binding metadata. **No live OAuth request, data mutation, database query, receipt download, or secret value was inspected.**

> **DECISION: NO PRODUCTION CUTOVER. NO STAGING DATA WRITES YET.** GitHub Pages serves the UI and 12 HTML routes, but it does not execute Cloudflare Pages Functions, Node.js APIs, authenticated sessions, Telegram webhooks or D1/R2 bindings. Existing Cloudflare production stays authoritative until every gate below is evidenced.

## 1. Evidence and current boundary

- GitHub Pages: `https://duykhang68.github.io/reddit-editor/` is a **public static preview**, not a secure authenticated editor. [Preview deployment evidence](https://github.com/duykhang68/reddit-editor/actions/runs/42949949086): build, deployment and 12/12 HTTP HTML route smoke checks passed. Source: [preview adapter](../scripts/prepare-pages-preview.mjs), [workflow](../.github/workflows/pages-preview.yml).
- Cloudflare production: `https://duynguyen-reddit-editor.pages.dev/` is a Pages project. During this audit the Cloudflare API reported its latest deployment status as `success`. This **does not** prove individual live features pass end-to-end.
- `apps/web/functions/_middleware.js` uses a signed Cashflow Google session to protect non-public pages on Cloudflare; GitHub Pages does **not** run this middleware. The Pages preview banner and `noindex` are labels, **not** an access-control boundary.
- `apps/web/src/api.js` calls same-origin `/api` with `credentials: 'same-origin'`; `App.jsx` navigates to `/auth/google/start`. These calls cannot use the Cloudflare backend from `github.io` simply by deploying HTML.
- `apps/web/src/expenses/driveClientResolver.js` discovers the shared Google OAuth Web Client ID using build-time configuration, same-origin browser storage, and `/api/drive-client-config`. Storage from the Cloudflare origin is **not shared** with `github.io`.

### Critical live binding finding — MUST FIX BEFORE STAGING WRITES

Read-only Cloudflare configuration inspection confirmed the following for the existing `duynguyen-reddit-editor` Pages project:

| Binding / configuration | Production | Existing Cloudflare preview | Audit conclusion |
| --- | --- | --- | --- |
| `CASHFLOW_DB` D1 ID | Present | **Same database ID** | **BLOCKED:** preview is *not* isolated from production data |
| `CASHFLOW_BACKEND` service target | Present | **Same Worker service and environment** | **BLOCKED:** preview can reach the production backend |
| Cashflow Worker `DB` | Present | Not separately provisioned | Its D1 resource matches the Pages production `CASHFLOW_DB` |
| Cashflow Worker `EVIDENCE` | R2 binding present | Not separately provisioned | Requires a distinct staging bucket and worker |
| Pages `APP_SECRET`, Google/GA4 credentials | Production settings contain named entries | Only limited preview settings were visible | **Do not assume** preview has valid, isolated credentials |

**Operational consequence:** Do not use the existing Cloudflare Pages preview deployment or the public GitHub Pages site to test any *write, delete, reprocess, OCR ingestion, Drive restore, Sheets mutation, or webhook* against these bindings. A different preview URL or branch alone does not isolate data. This audit did **not** expose IDs, secret values, transaction contents or private account identities.

## 2. Inventory: root Editor + all 12 utility routes

Status categories: **STATIC** = HTML route was served, **BROWSER** = some operations execute locally/directly with Google/provider APIs, **SERVER** = needs Cloudflare/Node logic, **NOT E2E VERIFIED** = no authenticated functional test yet. **All entries remain NOT E2E VERIFIED** on GitHub Pages.

| Route | Source / data flow | Required integrations | Primary blocker or test |
| --- | --- | --- | --- |
| `/` Editor | `apps/web/src/App.jsx`, `src/api.js`, `functions/[[path]].js` | **SERVER** Blogger OAuth, status, posts, drafts, series, GA4; browser Drive | Same-origin `/api`, `/auth`, cookies and CSRF; protect publish/delete |
| `/cashflow-intelligence/` | `src/cashflow-intelligence/main.js`, `cloud.mjs`, Pages `cashflow-intelligence/api/[[path]].js` | **SERVER** Google ID token/session, D1, Worker RPC; **BROWSER** Drive/Sheets backup | Strict origin checks; protected mutations; separate D1/R2/Worker mandatory |
| `/ga4-insights/` | `public/ga4-insights/index.html`, `functions/api/ga4-insights.js` | **SERVER** GA4 reporting, service account, dashboard access gate | `/api/ga4-insights` unavailable on Pages; private access and rate-limit review |
| `/voice-studio/` | `public/voice-studio/index.html` | **BROWSER** provider APIs with user-supplied keys | Test only with dummy content; review browser key exposure and provider CORS/usage |
| `/typesetting-tools/` | `public/typesetting-tools/index.html` | **BROWSER** local media, local project storage, optional provider features | Local-only SRT/VTT/ASS/LRC smoke; optional AI and key-handling tests separately |
| `/youtube-subtitle-writer/` | `src/youtube-subtitle-writer/Writer.jsx` | **BROWSER** Google Identity Services, Drive, Sheets, AI providers | Web Client ID discovery; origin allowlist, consent/scopes, conflict-safe backup |
| `/wikipedia-writer/` | `src/wikipedia-writer/Writer.jsx` | **BROWSER** Wikipedia, Google Identity Services, Drive, Sheets, AI providers | Public Wikipedia read separate from authorized Sheets writes; no real test writes |
| `/rollback-dashboard/` | `public/rollback-dashboard/index.html`, `functions/api/rollback-history.js` | **SERVER** rollback history proxy; optional **BROWSER** direct GitHub API/PAT | No actual rollback during staging; opt-in PAT persistence in localStorage requires security review |
| `/vocabulary-insights/` | `public/vocabulary-insights/index.html`, `src/services/vocabularySheet.mjs` | **SERVER** service-account Google Sheets read; browser login link | `/api/vocabulary-sheet`, `/auth/google/start` absent on Pages |
| `/starbucks-insights/` | `src/starbucks-insights/StarbucksInsights.jsx`, `useStarbucksDriveSync.js` | **BROWSER** local data, receipt OCR and Google Drive sync | Fresh `github.io` origin lacks stored Client ID; verify independent backup and conflicts |
| `/highlands-insights/` | `src/highlands-insights/HighlandsInsights.jsx`, `useHighlandsDriveSync.js` | **BROWSER** local data, receipt OCR and Google Drive sync | Same OAuth discovery issue; keep datasets isolated from Starbucks/Expenses |
| `/payroll-insights/` | `src/payroll-insights/main.jsx`, `usePayrollDriveSync.js` | **BROWSER** local PDF parse, opt-in encrypted Drive backup | **Never upload real payroll PDFs to staging**; synthetic fixtures and encryption tests |
| `/expenses/` | `src/expenses/Expenses.jsx`, `useExpenseDriveSync.js`; legacy `/api/expenses-state` handler also exists | **BROWSER** local + Drive; **SERVER** legacy D1 API if used | Verify actual consumer of legacy endpoint, Drive sync and cross-device conflicts |

### Server route groups to migrate deliberately

1. **Blogger / Editor** — `/api/health`, `/api/status`, `/auth/google/start`, `/auth/google/callback`, `/api/logout`, `/api/blogs`, `/api/posts[/:id]`, `/api/drafts`, `/api/series`. Source: [Pages catch-all](../apps/web/functions/[[path]].js). Includes writable Blogger operations; **no automated publish/delete** in smoke tests.
2. **Google configuration and data** — `/api/drive-client-config`, `/api/vocabulary-sheet`, `/api/expenses-state`, `/api/ga4-traffic`; service account and D1 requirements vary. Google OAuth Web Client ID is public; service-account JSON, client secret and tokens are server-only.
3. **Insights and rollback** — `/api/ga4-insights`, `/api/ga4-public`, `/api/rollback-history`. [GA4 public endpoint](../apps/web/functions/api/ga4-public.js) explicitly allows the Blogger origin; never broaden its CORS allowance just to make GitHub Pages tests pass.
4. **Cashflow** — `/cashflow-intelligence/api/{config,session,me,logout,ledger,summary,transactions,insights,snapshot,reprocess,save}` with signed `__Host-cashflow_google_session`, Google verification, CSRF/Origin checks, D1 and `CASHFLOW_BACKEND` RPC. [Pages Cashflow API](../apps/web/functions/cashflow-intelligence/api/[[path]].js). Worker source: [`cashflow-backend/worker.mjs`](../cashflow-backend/worker.mjs), including Telegram, D1 `DB` and R2 `EVIDENCE`.

## 3. Target architecture and authentication decisions

**Safe first milestone:** retain the GitHub Pages preview for **public static UI smoke tests only**; create a **separate Cloudflare staging frontend/API origin** for authenticated functional testing, paired with an isolated staging Worker, D1 database and R2 bucket.

```text
GitHub Pages (PUBLIC, HTML-only) ------> static/read-only checks
                                          NO production cookies, OAuth callbacks,
                                          D1/R2 credentials, financial test writes

Cloudflare staging origin (non-production)
  -> staging auth middleware + OAuth callback
  -> staging Pages Functions / API
      -> staging D1 ONLY
      -> staging Worker service binding ONLY
          -> staging D1 + R2 ONLY
          -> test Telegram bot/webhook and non-production identities ONLY

Cloudflare production origin -> unchanged production Pages / Worker / D1 / R2
```

**Do not bypass browser security:** Current Blogger client uses `credentials: 'same-origin'` and the Cloudflare handler validates exact `Origin` and CSRF token. Cashflow uses same-origin `__Host-` cookies. Switching the frontend to `github.io` is **not** solved by replacing a URL or adding `Access-Control-Allow-Origin: *`; the browser origin, OAuth redirect URIs, cookie scope / SameSite, trusted CORS allowlist, CSRF protection and login state must be redesigned and tested. Prefer a same-origin BFF/reverse-proxy or custom-domain setup if GitHub Pages must eventually host a fully authenticated UI. Do not weaken the public static preview or use persistent browser OAuth tokens.

**Shared Google OAuth:** Follow [AGENTS.md](../AGENTS.md): reuse the Web Client ID discovery, minimum scopes, allow explicit consent/reconnect and account switching, keep access tokens in memory, and never expose Google Client Secret or service-account credentials to the browser. Validate authorized JavaScript origins and exact redirect URIs for the **staging** origin before enabling login.

**Audit item (no code change):** The legacy Rollback Dashboard supports optional GitHub PAT persistence in localStorage, which is not encrypted. Review this before exposing write-capable rollback controls outside the protected Cloudflare origin.

## 4. Staging provisioning and safety gates (next separate PR)

**GATE S1 — Isolation must be proven before any functional test write**

- [ ] Create distinct **staging D1** database(s) with synthetic-only rows; migrate schemas using reviewed, non-destructive steps. Record only resource names and one-way fingerprints/IDs in protected internal deployment evidence, never secrets or private data in public GitHub logs.
- [ ] Create distinct **staging R2** evidence bucket; configure private access and least-privilege read/write bindings. Verify object keys are non-production and no public URL serves bank evidence.
- [ ] Deploy an isolated **staging Cashflow Worker** with its own `DB`, `EVIDENCE`, webhook secret, authorized test principals and service binding. Disable real Telegram webhook / production bridge synchronization until specifically tested with a separate test bot and synthetic data.
- [ ] Point a **staging Pages/API project** to staging-only `CASHFLOW_DB` and `CASHFLOW_BACKEND`. Check IDs, Worker target **and environment** differ from production before using the environment; a second URL alone is insufficient.
- [ ] Keep `GOOGLE_CLIENT_SECRET`, `APP_SECRET`, GA4/Sheets service-account JSON, Worker secrets and API tokens in managed server-side secrets only; set separate staging values and least-privilege Google test access.
- [ ] Machine-check the deployment manifests/bindings for **prod!=staging** D1, R2 and Worker target. Fail-closed if missing/ambiguous.
- [ ] Confirm production Pages, Worker, bindings, DNS and OAuth settings were not changed; save read-only before/after configuration fingerprints.

**GATE S2 — Security and integration tests (staging only)**

- [ ] Test Google OAuth start/callback, state/PKCE, allowed redirect, CSRF and cookie attributes; deny unauthorized users and origins; cover expiry, revocation, logout, stale token and replay.
- [ ] Test Blogger and GA4 **read-only** paths with staging/test authorizations; destructive Blogger publishing requires a separate explicit owner-approved test and safe backup.
- [ ] Test Cashflow read, duplicate detection, synthetic transaction create/reprocess/save, rollback and permission denial against **isolated** D1/R2. Check read-back, idempotency and no production deltas.
- [ ] Test Drive/Sheets sync: shared OAuth Client ID; manual button; 180-second sync while tab is open; cross-device restore; independently tagged datasets; concurrent edit conflict and backup-before-overwrite; no repeated forced consent.
- [ ] Test Payroll only with synthetic PDF and passphrase; encrypted Drive snapshot read-back, failed decrypt and no raw PDF upload.
- [ ] Test all **12 actual routes** in a browser with both authenticated and logged-out states; report per-route **UI / auth / API read / API write / backup / error recovery**, not just HTTP 200.

## 5. Data preservation, rollout and rollback

**GATE S3 — Restore proof**

- [ ] Before any production data move, create verifiable D1 backup/bookmark and R2 inventory/version or copy strategy; validate row counts, revision integrity and sample object checksums under authorized access.
- [ ] Preserve immutable transaction IDs, delete tombstones, audit history, source receipts and independent Drive snapshot ancestry. Never truncate or overwrite history to align schemas.
- [ ] Perform a full **staging restore rehearsal** with synthetic data; demonstrate rollback time, schema compatibility, ability to re-enable original Worker/Pages deployment and zero lost test records.
- [ ] Exercise fail-closed behavior when a binding, token, Google scope or storage provider is unavailable. No hidden fallback to production resources.
- [ ] Document rollback trigger, responsible owner, last-good deployment IDs, recovery steps and verification evidence *before* scheduling cutover.

**GATE S4 — Go/no-go (not approved by this audit)**

- [ ] Required GitHub CI green at the **exact** tested SHA; Cloudflare staging deploy and integration reports green.
- [ ] 12/12 route acceptance backed by real functional evidence, including auth, backup and conflict tests.
- [ ] Production data backup and rollback rehearsal verified; production monitoring and bounded observation window ready.
- [ ] Explicit owner authorization for DNS, OAuth redirect URI or production backend changes. No implicit cutover based on a GitHub Pages green check.

## 6. Ordered, single-scope follow-up PRs

| Proposed PR | Scope | Must not do |
| --- | --- | --- |
| **#5 — Staging resource isolation** | Provision/test isolated Cloudflare staging Pages + Cashflow Worker + D1/R2, binding assertions and **synthetic fixtures only** | No production DB/R2 write, webhook switchover or DNS change |
| **#6 — Auth / API staging compatibility** | Explicit non-production origin routing, OAuth/CORS/CSRF/cookie tests; same-origin authenticated staging frontend | No `* ` CORS with credentials, no client secrets in JS |
| **#7 — Functional 12-route verification** | Browser E2E and Drive sync test matrix; fix identified incompatibilities in narrowly scoped PRs | No real receipt, payroll or transaction data in CI |
| **#8 — Backup/restore and cutover rehearsal** | D1/R2 and Drive integrity checks, reversible staging restore and production go/no-go proposal | No production cutover without explicit separate approval |

These numbers are **planning labels**, not pre-created GitHub PR numbers; actual numbering may differ.

## 7. Verification / evidence ledger

| Evidence | Result |
| --- | --- |
| [GitHub Pages static deploy](https://github.com/duykhang68/reddit-editor/actions/runs/42949949086) | SUCCESS; 12/12 HTML routes; **no backend assurance** |
| [CI Quality Gate](https://github.com/duykhang68/reddit-editor/actions/runs/42949949053) | SUCCESS; 237/237 tests at the referenced deployment |
| GitHub source audit | Confirmed exact same-origin API calls, session-bound Pages handlers, browser Drive/Sheets code |
| Read-only Cloudflare config audit (2026-11-11) | **FAIL isolation:** Pages preview and production share `CASHFLOW_DB` ID and `CASHFLOW_BACKEND` service/environment |
| Read-only Cashflow Worker settings audit | Confirmed live Worker has `DB` (matching production Pages D1) and `EVIDENCE` R2 binding; no secret values read |
| Live browser OAuth/API functional tests | **NOT RUN**; requires isolated staging and owner-authorized test accounts |
| D1/R2 backup integrity and rollback drill | **NOT RUN**; future gate |
| Cloudflare production change during this audit | **NONE** |

**Owner safety rule:** Do not publish credentials, private financial records, live customer data, Google access tokens, service-account JSON, Worker environment values, or R2 objects in this public repository, GitHub Actions logs, public Pages artifacts or PR discussions.

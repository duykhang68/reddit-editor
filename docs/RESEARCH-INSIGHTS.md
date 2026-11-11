# Research Insights (Google OAuth dashboard)

**Route:** /research-insights.html (Cloudflare Pages and local Vite).

This is a separate Vite HTML entry with its own React root and CSS; it does not mount the Blogger editor.

## Security

- The frontend calls /api/status first and renders NO charts or incident data until the existing Google OAuth session is connected.
- /api/research-insights is also protected at both Node and Cloudflare Pages backends. A browser request without a valid encrypted/session cookie is rejected with 401. The backend refreshes expired Google access tokens before fetching metrics.
- Click "Kết nối bằng Google" to reuse /auth/google/start?return_to=research-insights. Only a fixed server-side allowlisted return path is accepted; Google OAuth state + PKCE remain unchanged. OAuth callback returns to this dashboard.
- GitHub credentials (optional) are exclusively server-side: RESEARCH_GITHUB_TOKEN. Never put them in VITE_* variables, source files or browser storage. If omitted, the public repository can be read anonymously under GitHub's API rate limits.

## Actual data source / definitions

researcher.py is event-driven, NOT an HTTP server. Its durable research outputs are GitHub Issues with titles starting [RESEARCHER]. The dashboard reads these issues through the authenticated backend; the separate GitHub Actions API provides workflow run telemetry.

- **Total Research:** researcher-created incidents found among the latest 100 GitHub issues, not number of Python executions.
- **Active Pipelines:** currently noncompleted workflow runs from the latest 100 GitHub Actions runs.
- **Real-time Latency:** server-side duration of the two GitHub API requests, not the runtime of researcher.py.
- **Success Rate:** percentage of successful concluded workflows in the latest 100 runs, excluding skipped/neutral.
- **Activity:** newly created researcher incidents by UTC calendar day over the most recent 14-day window.
- **Error classes and incident types:** derived from researcher issue code/body.
- **Occurrences:** 1 + issue comment count (proxy only; comments can include other conversation).
- **Website traffic:** verified GA4 web stream `G-Z83BHS8KMY` / Stream ID `16289663503` at `https://duynguyen99.blogspot.com`. Four metrics: distinct active users over 7 calendar days (including today), sessions, page views, and realtime active users over the last 30 minutes. Never derive active users from page views.

Polling is every 3 minutes when the tab is visible; there is also manual refresh. Failed API calls show an error, and stale data stays visibly marked.

GitHub API public limits apply. Backend uses the existing `GITHUB_TOKEN` (shared with Quality Gate) first, then falls back to `RESEARCH_GITHUB_TOKEN`. Configure at least one as a secret in Cloudflare Pages Production settings. GitHub App tokens require **Issues: read** and **Actions: read**. Never place either token in a `VITE_*` environment variable or browser bundle.

**Partial-failure behavior:** `GET /api/research-insights` now returns a `sources.issues` and `sources.actions` health record. Issues and Actions are fetched independently. If Issues fails, researcher KPI, chart, category bars and incident list are shown as unavailable (not zero); Actions KPI stays available. If Actions fails, Issues stats stay available but pipeline and success stats are null. If both fail, the page explains why rather than displaying an unexplained HTTP 500. Code examples: `GH_RATE_LIMIT` (GitHub quota; configure token), `GH_TOKEN_INVALID` (incorrect/expired token), `GH_FORBIDDEN` (missing permissions), `GH_NETWORK` (network/timeout).

Researcher-specific numbers may genuinely be small: `Total Research` counts only GitHub Issues with titles beginning `[RESEARCHER]`; it does **not** count all PRs, workflow runs, or all issues. The chart counts the last 14 days of those researcher issues only. The Runs KPI samples the latest 100 workflows. This distinction is intentional to prevent invented values.

## Deploy

Build command: npm run build. Build output: apps/web/dist. Cloudflare Pages Functions live under apps/web/functions and serve /api/* and /auth/*. Deploy the updated build and Function together. On Google Cloud, ensure the configured OAuth redirect URI already points to /auth/google/callback on the production domain; the new dashboard does not require a new redirect URI.

For local development: npm run dev and open http://localhost:5173/research-insights.html. Google OAuth requires the existing apps/server/.env configuration, a running Node API, and authorized OAuth origin/callback.

Run tests: npm run check, then npm run build. Never assume a successful deploy before CI and Cloudflare publish are confirmed.

## GA4 website traffic (production + localhost)

This dashboard reads your **existing** Blogger GA4 stream; it does not inject a tracking tag into Blogger. Ensure the GA4 tag for `G-Z83BHS8KMY` already runs on `https://duynguyen99.blogspot.com/` and Google Analytics > Realtime shows events from an actual visit. Measurement ID and Stream ID are **not** the numeric Property ID needed by the Data API.

**Confirmed property:** Google Analytics 4 numeric Property ID **`563038949`** is the default in both Cloudflare Pages and local Node backends. The API still validates that Property ID against Stream ID `16289663503`, Measurement ID `G-Z83BHS8KMY`, and website URL before reporting traffic. You do not need to configure `GA4_PROPERTY_ID` for this property. The variable remains an override if the property changes.

**Setup in the same Google Cloud project as your existing Editor OAuth client:**

1. Enable **Google Analytics Admin API** (`analyticsadmin.googleapis.com`) and **Google Analytics Data API** (`analyticsdata.googleapis.com`).
2. Ensure the Google account used in the Editor has at least **Viewer** access to this GA4 property. Do not create an API key, service account, or put tokens into frontend code.
3. Deploy the changes. On Research Insights, under **Signal health → Website traffic**, click **Kết nối Google Analytics**. This intentionally starts OAuth with `https://www.googleapis.com/auth/analytics.readonly` in addition to the existing Blogger scope. Existing Blogger-only sessions do not automatically gain Analytics access.
4. The backend first discovers accessible GA4 properties via Analytics Admin API (checking up to four, prioritizing properties named for the blog), then verifies the stream's ID, measurement ID, and URL *before* querying metrics. If you later change properties, configure numeric `GA4_PROPERTY_ID` in **Cloudflare → Workers & Pages → project → Settings → Variables and Secrets → Production**, and redeploy if required. The same variable is optional in `apps/server/.env` for localhost. Never set it to `16289663503` unless Google Analytics **Property settings** independently shows this as the property's own ID.
5. Refresh Research Insights to read source data. The GA4 section polls every 3 minutes while the tab is visible, independently of the GitHub Research Insights endpoint.

**Endpoint:** `GET /api/ga4-traffic` is session-protected and returns source-verified metrics only. The Google OAuth token remains in the encrypted Cloudflare cookie / local backend session, not in the JSON response. GA4 access is opt-in; `/api/status`, Blogger, and GitHub Insights continue using the existing OAuth behavior.

**Statuses:** `needs_consent` requests Google Analytics read-only access; `needs_property` means the property could not be automatically matched or the configured ID belongs to a different stream; `unavailable` reports API/permission/quota/network issues. No API failure is represented as zero traffic. A verified empty GA4 report is the only case where zero is displayed.

**Interpretation:** A `7-day active users` metric represents users active over the entire requested date range (not the sum of daily users). The realtime metric covers the last 30 minutes, not users online this second. GA4 reports can have processing delay and do not necessarily match every UI view exactly.

**Diagnostics:** If Analytics shows "API not enabled", enable both APIs in Google Cloud. If "no access", grant the signed-in user Viewer access in Google Analytics Admin. If "needs property", find the numeric ID under **Google Analytics → Admin → Property settings → Property ID**, and set the `GA4_PROPERTY_ID` backend variable. If no analytics events arrive, check the actual Blogger theme's Google tag and browser consent/ad-blocking; this API integration cannot record site visitors by itself.

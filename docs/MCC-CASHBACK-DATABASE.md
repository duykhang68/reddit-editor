# MCC Cashback Database · Cloudflare Pages + Sheets

- Public route: `/mcc-cashback/` on `duynguyen-reddit-editor.pages.dev`, also accessible from OneBlog TOOLs.
- API: `GET /api/mcc-cashback` reads `MCC_Data!A1:O2000` in the native Google Sheet.
- Google Sheets: https://docs.google.com/spreadsheets/d/18HueEhTZMv8VErQcQrRR60q1RXjbspAtyysB9PjJTAo/edit
- Existing `GOOGLE_SERVICE_ACCOUNT_JSON` Pages secret reused. **Share the new Sheet with the service account client_email** as Viewer for read access. Browsers never see a token or a service-account key.
- Static `snapshot.json` (as of 2026-11-20) is a dated fallback, not live evidence.
- Browser refreshes the API every 3 minutes **only while open**; do not claim closed-tab sync.
- Server caches live Sheets data for 180s; no browser Google API key needed.
- Rows with `IMPORTED_UNVERIFIED` or `EXPIRED_REVIEW` must be visibly labeled and cannot be called verified current offers.
- Each row includes the official source URL, conditions, cap and comparison fields.

## Crawler

`workers/mcc-crawler/index.mjs` is a separate **Cloudflare Worker scheduled monitor**.
Use `cf` for new Worker deployment, configure the existing service-account JSON as Worker secret and grant it Editor permission to the new Sheet. Suggested UTC cron: `0 0,12 * * *` (twice a day). The Worker reads `Sources`, checks **only allowlisted official HTTPS hosts**, hashes HTML/PDF source, appends `Crawl_Log`, and places changed documents into `Review_Queue`. It does not interpret percentage text from arbitrary PDFs or override cashback. Confirmed new terms must be reviewed against the linked document and then added as new versioned rows in `MCC_Data`.

The Worker is **not deployed** by the static Pages build. Deployment and secret provisioning must be verified separately. Preserve fail-closed behavior if Google denies access.

## Regression

`node --test apps/web/test/mccCashback.test.mjs`; then `npm run check && npm run build`.

Safety: never publicize service-account keys; never follow off-domain redirects, overwrite human-authored rates, or label an unverified percentage as current.

# Vietnamese · Korean · English Vocabulary Insights

**Route:** `/vocabulary-insights/` · Independent light-mode dashboard, linked in Editor Quick Access.

## Source of truth

- Drive folder: https://drive.google.com/drive/u/0/folders/1coylrqzqPOLZP_lhUdWlb3nI47Qr-af7
- Spreadsheet: https://docs.google.com/spreadsheets/d/19nL6wtouHV-0OumsQR2jF-5xWA1cpbpivRUIsm7hDgk/edit?gid=0
- Tab at implementation: **Sheet1** (`gid=0`), grid 1,865 rows × 27 columns. Only A:F are used.
- Schema: `Việt ` / `Hàn ` / `Anh ` / `Context or Expression` / `Ngữ pháp ví dụ` / `Category`.
- Service account already shared by the owner: `blognaver-articlepdf@blognaver-automation-article.iam.gserviceaccount.com`.

## Cloudflare Pages configuration (required before live sync)

1. In Google Cloud Console, open the **existing** service account and provision/obtain its JSON key securely. Do not paste the JSON into GitHub source or a `VITE_*` variable. **Never share private-key JSON in chat, commit history, or browser settings.**
2. Cloudflare Dashboard → Workers & Pages → **duynguyen-reddit-editor** → Settings → Variables and Secrets (or Settings → Environment variables, depending on Cloudflare UI). In Production configure `GOOGLE_SERVICE_ACCOUNT_JSON` as a **Secret** with the complete service-account JSON, including `client_email`, `private_key` and `token_uri`. Configure Preview separately if used. Redeploy to apply.
3. Verify that the service account email has at least Viewer permission on the Sheet. The supplied Editor access is sufficient. Its JSON key is a credential; the email address alone cannot sign requests.
4. Connect Google in Editor first using the existing Blogger OAuth session, then open `/vocabulary-insights/` and press **Đồng bộ ngay**. The endpoint returns HTTP 401 without this authenticated Editor session.
5. The browser never sees the service-account credential. Cloudflare signs a short-lived JWT with WebCrypto and exchanges it for a Google OAuth token server-side. Google Sheets is read-only.

The endpoint `GET /api/vocabulary-sheet` caches successful responses in its Worker isolate for 180 seconds; `?refresh=1` forces a read. The page rechecks every 180 seconds **only while open, visible, and online**. A cache is not proof of permanent storage; the Google Sheet itself remains the authoritative Drive-backed dataset. Errors are shown explicitly, not turned into zero words.

## Sections

1. **Source Sync** — current status, manual refresh, timestamp, direct source links, auth errors.
2. **Knowledge Base** — search all six columns, category filter, collapsed details for context and grammar, 3 rows/page by default with 10/25/50 options, previous/next.
3. **Smart Insights** — counts over all non-empty lexical rows (even filtered/hidden rows in Google Sheets), category histogram and completeness bars.
4. **Flashcards** — Vietnamese/Korean/English front side, reversible translations, category deck, shuffle, previous/next, context and grammar sourced from the original row. No fabricated AI examples.

## Safety / limitations

- The supplied spreadsheet is not edited. No private credential is stored in the browser.
- There is no browser-side copy of the entire dataset in localStorage, and no claiming ongoing sync after the tab closes.
- User progress and study history are not persisted cross-device in this initial read-only edition. If adding progress storage later, use separate Google Drive appProperties and revision-safe backup per `docs/GLOBAL-GOOGLE-DRIVE-SYNC-POLICY.md`.
- The Cloudflare cached dataset uses a 5,000-row A:F window. Expand it if the source grows past this threshold.
- `npm test` and `npm run build` from repo root should pass before merging; Cloudflare secret configuration and live manual sync must be checked after deploy.

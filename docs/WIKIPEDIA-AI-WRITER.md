# Wikipedia AI Writer · Duy Nguyen

Route: `/wikipedia-writer/` · GitHub repo: `duykhang68/tetdinhmuiblog`.

## Workflow
1. Paste an HTTPS Wikipedia article URL (vi/en/ko/etc.).
2. Select Gemini 2.5 Flash, Groq Llama 3.3 70B, or automatic Gemini→Groq fallback; enter provider API keys **only into browser session**. The page fetches Wikipedia's MediaWiki extracts API, sends excerpts to the AI and asks for original Vietnamese journalistic coverage with source attribution and an AI-generated trilingual vocabulary list.
3. Edit title, article and any of the six vocabulary fields before exporting. Verify facts and translations: AI can make errors. Content is not auto-published.
4. Connect Google OAuth, with client ID configured as `VITE_GOOGLE_CLIENT_ID` on Cloudflare Pages build settings. Enable **Google Sheets API** and **Google Drive API** and add the domain to authorized JavaScript origins. Required scopes: `spreadsheets` (append) and `drive.appdata` (private draft backup). The signed-in Google account needs **Editor** access to the target spreadsheet.
5. Click **Ghi từ mới vào Google Sheet** to read existing `Sheet1!A2:F`, omit rows whose Vietnamese/Korean/English form already appears and append only new rows with `RAW` input mode. Destination spreadsheet ID: `19nL6wtouHV-0OumsQR2jF-5xWA1cpbpivRUIsm7hDgk`. No existing rows are overwritten.
6. Click **Đồng bộ ngay** to save article and vocabulary in Google Drive's hidden `appDataFolder`; when Google is connected and page remains open, edits auto-backup every 180 seconds. On next login, recover the newest matching backup. API keys are NEVER backed up.

## Safety and limitations
- Frontend keys are held in React memory only; direct browser-side provider API calls may be restricted by provider CORS policies. In a production multi-user setup, use authenticated server-side proxy with secret storage and rate limits.
- This design does not need a GitHub secret for the AI models. Never embed keys in the built app or in Git commits.
- A simple normalized, best-effort duplicate check is used; simultaneous writers can still race. Review newly appended rows and the Google Sheet's own automation/AI edit triggers.
- Google Drive uses a dedicated appDataFolder backup name, separate from Expenses and Starbucks. Conflict check reads `modifiedTime` just before updates; this does not give atomic compare-and-swap. For stronger concurrency, use immutable versioned Drive snapshots.
- Wikipedia APIs and third-party AI services can be rate-limited. Wikipedia excerpts are limited to 16,000 characters for predictable prompt size.
- Wikipedia material must be attributed, fact-checked, and rewritten; obey attribution and licensing rules when using source content beyond factual background.
- The draft is saved only when Google is connected. Closing the tab before first backup may lose unsaved work.

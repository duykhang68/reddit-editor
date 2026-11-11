# Browser smoke verification of the GitHub Pages static preview

This phase verifies **visible UI and local, synthetic browser interactions** for the [GitHub Pages preview](https://duykhang68.github.io/reddit-editor/). It is not an OAuth, Blogger, Cashflow, Drive/Sheets, D1 or R2 integration test.

## What the Chromium workflow checks

- Opens the Editor and **all 12 quick-access utility routes** with a real Chromium browser, verifies HTTP 200, title, non-empty page content and the visible "GitHub Pages preview" notice.
- Verifies the Editor quick-access section contains exactly 12 working links under the expected `/reddit-editor/` base path.
- Exercises **Voice Studio local text input, character count and clear button** without providing an API key or generating voice.
- Exercises **TypesettingTools local subtitle creation from two dummy lines**, validating the resulting editable timeline rows; no user media file or uploads.
- Captures **only public, clean-browser screenshots** of the 13 pages, uploaded to a short-lived GitHub Actions artifact for review.
- Runs with fresh browser contexts and no Google account, financial records, passwords, tokens or persistent browser profiles. It never calls `POST` on private services intentionally.

**Run:** [`.github/workflows/preview-browser-smoke.yml`](../.github/workflows/preview-browser-smoke.yml) uses a pinned, **ephemeral** Playwright version in the runner. The source is [`scripts/browser-preview-smoke.mjs`](../scripts/browser-preview-smoke.mjs).

## Explicit limitations

- Rendering and navigation success does **not** certify Google OAuth, provider-generated WAV, receipt OCR accuracy, Google Drive sync, Blogger edits, GA4 reports, real rollback, Cashflow ingestion, encrypted Payroll Drive restore, or authorization of any write operation.
- The preview is publicly accessible; never type real client secrets or financial data into it.
- Protected APIs are deliberately disabled on GitHub Pages; the separate Cloudflare staging API readiness gateway currently denies OAuth and financial operations.
- Browser screenshots are synthetic and should not be confused with production functional acceptance.

## Next steps

1. Prove staging OAuth with a separately authorized Google origin and callback; test cookie, CSRF and cross-origin access with test accounts only.
2. Integrate isolated D1/R2 and selected non-destructive APIs through the protected same-origin staging frontend; never bypass service-account or private session boundaries.
3. Expand real functionality tests for the **12 utilities** in separate scoped PRs; use mock providers / synthetic PDF / synthetic transactions for CI and opt-in private staging tests for Google-backed operations.
4. Prove production backup + isolated restore, then request an explicit production cutover authorization.

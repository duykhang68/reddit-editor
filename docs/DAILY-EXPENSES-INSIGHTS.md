# Daily Expenses & Insights — Development notes

**Repository:** duykhang68/tetdinhmuiblog  
**Page:** https://duynguyen-reddit-editor.pages.dev/expenses/ (available after successful merge/deployment)  
**Entry point:** apps/web/expenses/index.html  
**Date:** 2026-11-07

## Scope & architecture

The page is intentionally a **personal expense tracker**, not Starbucks loyalty. It reuses the existing React 19 / Vite multipage structure, Reddit Sans typography, rounded light surfaces, and emerald brand accents. It does not import or mutate Starbucks Rewards calculations.

- UI: apps/web/src/expenses/Expenses.jsx
- Pure finance calculations and validation: apps/web/src/expenses/model.js
- Emerald / Dark Forest / Cream light-mode design: apps/web/src/expenses/expenses.css
- Standalone Vite entry: apps/web/src/expenses/main.jsx
- Editor shortcut: EDITOR_QUICK_LINKS in apps/web/src/App.jsx
- Tests: apps/web/test/dailyExpenses.test.mjs

The Vite multipage build outputs /expenses/index.html. No extra React Router dependency is necessary.

## User flows

1. Add a transaction: amount, category, optional short note, date. All entries are VND; amounts must be positive whole numbers.
2. Create a custom category inline. It is auto-saved **immediately** and added to the picker, including in future months.
3. Configure the overall monthly budget and independent per-category limits. Empty means not set; 0 means no spending allowed. All category IDs, including custom IDs, can have their own limits each month.
4. Switch month/year. Overview shows all selected-month spending; the category dropdown filters **the transaction feed and CSV only**, never silently changing the month-wide budget summary.
5. Review category progress meters, 80% warning, 100% over-limit state, current-month spending velocity, daily averages, unusual days, and short budget tips.
6. Edit/delete transactions; export all data to JSON; restore with explicit confirmation; export current feed to CSV.

## Data semantics & correctness

- No synthetic transactions, seeded demo, or misleading "live" label.
- All calculations use persisted transactions, not mocked API data.
- Monthly forecasting is available **only for the current month**. Forecast = (spent / elapsed calendar days) × days in month. It is an estimate, not a promise.
- Daily average is spent divided by elapsed calendar days (including days with no expenses).
- Anomaly alerts require at least four distinct days with recorded expenses; the alert uses the active-day median and mean with a minimum absolute spending threshold. Insufficient data does not trigger false alerts.
- Budget-warning threshold: at least 80% of a configured limit. At 100% or above, display exceeded. A zero limit only warns if actual spending is positive.
- All calendar boundaries use Asia/Ho_Chi_Minh. Budgets are scoped by YYYY-MM. Custom categories persist across budget periods.

## Persistence & security status

**Current storage:** browser localStorage, key \`dn-daily-expenses-v1\`. Writes occur synchronously when a transaction, budget, or category is created/edited/deleted. This provides persistence on the same browser and across months.

**Important limitation:** localStorage is **not a shared Cloudflare database**, and it is not cross-device or cross-browser sync. The page intentionally says "Dữ liệu trên thiết bị" instead of claiming remote sync. Export JSON backups frequently. Browser data removal or using a different device does not restore transactions automatically. This is a deliberate fail-closed design: financial records are not published to GitHub, embedded in static files, or exposed through a shared unauthenticated endpoint.

**Production upgrade:** To meet remote multi-device persistence, provision Cloudflare D1 and build authenticated CRUD endpoints tied to a stable Google OAuth subject (not a globally shared D1 table). Add CSRF/origin checks for mutation operations, server-side validation, version checks for conflicts, data migration/import from localStorage, and read-after-write verification. Do not expose D1 bindings or database credentials to client JavaScript. This requires a production database binding and authorization policy; do not silently assume these exist.

## Quality checks

- \`npm test\`: expense model, category persistence, budget thresholds, forecasting, anomaly detection, validation, CSV output, Vite route, Editor shortcut.
- \`npm run build\`: production Vite multipage build.
- \`npm run check\`: repository quality gate.
- Manual smoke test: open /expenses/, add a custom category, enter a transaction, set category limit, reload and switch to another month, verify category persists, edit/delete, JSON export/import, mobile layout, and direct route navigation.

## Deployment protocol

This change is isolated to one feature branch and one PR. Merge only after CI checks pass and GitHub branch protection accepts the PR. Cloudflare Pages deployment follows the repository's existing integration; a PR alone is not proof the live site already updated.

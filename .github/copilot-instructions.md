# GitHub Copilot — repository instructions

This project has a mandatory owner-defined rule. Read and follow [AGENTS.md](../AGENTS.md) and [GLOBAL Google Drive sync policy](../docs/GLOBAL-GOOGLE-DRIVE-SYNC-POLICY.md) before creating or editing any statistics, financial/expense, analytics/insights or data-management page.

**MUST:** Every such page, including new routes and existing routes modified by a PR, needs functional **Google Drive backup + restore**:
- Reuse the Editor's configured Google OAuth Web Client ID and Drive service, never store tokens or Client Secrets.
- Automatic synchronization every **3 minutes** while the page is open and the session is valid.
- Visible **Đồng bộ ngay** (manual sync), Drive connection button, sync state, last-success timestamp and backup link.
- Cross-device restoration, validation, immutable snapshots, explicit conflict choices, and an exportable backup before replacement.
- Distinct dataset tags and metadata keys; never mix records between modules.
- Tests and documentation must accompany the change. Existing UI/layout and data correctness must be preserved.

Do not label a PR compliant if it only documents sync without implementing it. Do not add Cloudflare/localStorage/GitHub-only persistence as a substitute. For technical exceptions, require explicit repository-owner approval recorded in the PR.

Known patterns: `apps/web/src/expenses/useExpenseDriveSync.js`, `apps/web/src/starbucks-insights/useStarbucksDriveSync.js`, and `apps/web/src/services/googleDriveService.js`.

Use **one feature = one PR**, keep the Reddit-inspired light visual style, and never commit secrets.

**MANDATORY — Quick Access:** Before shipping any new utility, standalone dashboard or new page route, add its canonical URL shortcut to the Editor's **“Truy cập nhanh”** section in the same PR, without duplicates or changes to existing links. Verify navigation, responsive UI and regression tests. See [AGENTS.md](../AGENTS.md) for acceptance criteria. Missing shortcuts block the PR.

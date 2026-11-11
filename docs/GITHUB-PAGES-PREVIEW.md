# GitHub Pages static preview (non-production)

Live static preview: https://duykhang68.github.io/reddit-editor/

## Verified publishing setup and post-merge trigger

1. This repository is **Public** and GitHub Pages is enabled with **GitHub Actions** as the source. Treat both the repository and published preview as publicly accessible: never put credentials, real financial records or private source data into artifacts.
2. A successful pull-request **CI · Quality Gate** and **Build and verify 12 static routes** are required before merging changes.
3. Bot auto-merges using `GITHUB_TOKEN` may not trigger a subsequent `push` workflow. The existing auto-merge gatekeeper explicitly dispatches **CI · Quality Gate** after merge. The **Preview · GitHub Pages (Static Only)** workflow also listens for `workflow_run` on that completed CI, but accepts it **only when successful on `main`**.
4. The deploy job checks that the exact SHA tested by CI is still the current `main`. It refuses stale artifacts, checks all 12 deep links, and fails if Rollback Dashboard reintroduces its deprecated QA auto-redirect. A deployed static preview still cannot execute OAuth or Cloudflare backend functions.

## Preview-only build and checks

From repository root:

    npm ci
    npm run check
    GITHUB_PAGES_PREVIEW=true npm run build
    GITHUB_PAGES_PREVIEW=true node scripts/prepare-pages-preview.mjs

The Vite base is set to /reddit-editor/ **only** for preview builds; normal Cloudflare builds retain /. The preview adapter updates navigation to the twelve known utility URLs, adds a visible "static preview" notice to each HTML page, and adds noindex/robots directives to the preview artifact.

## Route checklist

- /cashflow-intelligence/
- /ga4-insights/
- /voice-studio/
- /typesetting-tools/
- /youtube-subtitle-writer/
- /wikipedia-writer/
- /rollback-dashboard/
- /vocabulary-insights/
- /starbucks-insights/
- /highlands-insights/
- /payroll-insights/
- /expenses/

These are static HTML route checks, **not** evidence that each page's private integration works.

## Important boundaries

- GitHub Pages is a **public static host**, not a private backend. Do not put private financial records, secrets, OAuth tokens, service account credentials, or personal uploads in the public artifact.
- Cloudflare Pages Functions, Node.js server, Google OAuth callbacks, Cashflow D1/R2, backend sessions, GA4 private endpoints, and Telegram processing do **not** run on GitHub Pages. Some controls may display an authentication/configuration error in preview; do not claim these features work until backend migration and end-to-end tests.
- Do not switch production from https://duynguyen-reddit-editor.pages.dev/ or remove Cloudflare bindings while this preview is in progress.
- Preview-only changes must never alter normal Cloudflare output: no extra public routes, no modified OAuth redirect URI, and no silent fallback to a different data source.
- Existing Editor Quick Access includes all twelve tools. The preview adapter re-bases their navigation without adding extra production shortcuts.

## Next migration workstreams (separate PRs)

1. Decide the backend hosting target and verify Google OAuth callback origins, session cookies, CSRF and CORS.
2. Migrate Pages Functions and server APIs with authenticated integration tests; validate GA4 and Blogger permissions.
3. Migrate or reconnect D1 and R2 safely with backup, read-back and rollback evidence.
4. Test all twelve tools and Drive synchronization end-to-end on an authenticated non-production origin.
5. Only then consider a controlled cutover of the production URL; retain Cloudflare rollback capability.

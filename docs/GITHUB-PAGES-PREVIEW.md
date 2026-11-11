# GitHub Pages static preview (non-production)

Preview target, **only after GitHub Pages is enabled**: https://duykhang68.github.io/reddit-editor/

## Enable publication (repository owner)

1. Keep this repository **Private**. GitHub Pages publication from private repositories requires an eligible GitHub plan. A private repository does **not** make the published Pages website private.
2. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the publishing source. If GitHub blocks this on the account's plan, do not make the repository Public merely to bypass the restriction.
3. Merge the scoped preview PR only when **CI · Quality Gate** and **Build and verify 12 static routes** pass.
4. The **Preview · GitHub Pages (Static Only)** workflow builds and deploys from main. The post-deploy job checks the homepage and all twelve deep links.

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

# Staging Pages API readiness — fail-closed phase

**Date:** 2026-11-11  
**Project:** `reddit-editor-integration-staging` (dedicated Cloudflare Pages, **not** production)  
**Worker source:** [`infra/cloudflare/staging-pages-worker.mjs`](../infra/cloudflare/staging-pages-worker.mjs)  
**Live smoke:** [`.github/workflows/staging-api-smoke.yml`](../.github/workflows/staging-api-smoke.yml)  
**Dependency:** [staging isolation evidence](CLOUDFLARE-STAGING-ISOLATION.md).

## What this phase does

The isolated Cloudflare Pages project was deployed through the direct-upload API with an empty static manifest and an explicitly fail-closed `_worker.js` entrypoint. A Cloudflare deployment record (ID `0819f83a-e728-4bd0-8315-364555d735c4`) reported **deploy success**. The project binds `CASHFLOW_DB` only to the new staging D1 and `CASHFLOW_BACKEND` only to the new staging Worker. The Worker is in turn bound to staging D1 and R2.

- `GET /`: informational non-production page; no Editor or user data.
- `GET /health` and `GET /api/staging/health`: execute read-only D1 schema/revision + zero-transaction checks and call the **staging Worker service binding** to verify it has isolated D1/R2; return 200 only when all checks pass.
- All `POST` and other HTTP write methods: **405**.
- All existing Editor OAuth callbacks, Blogger APIs, Cashflow business APIs, GA4 private APIs, etc.: **503**.
- No wildcard CORS, no Google Client Secret, no cookies, no automated Telegram, no production data import.
- The staging project **does not contain the real Editor frontend or authenticated API** yet. GitHub Pages remains the public static preview.

## Evidence and limitations

- Cloudflare's deployment metadata confirms the staging deployment was created and reached `success`; this is **not** proof that the health endpoint returned 200 to public Internet users.
- The initial external HTTP check from the connected execution environment returned a tool-level `403 Forbidden: requests to ... pages.dev are not allowed`. This is an execution environment egress restriction, **not a validated response from the staging application**. We must not count it as an HTTP smoke success or infer the site itself returned 403.
- To independently test the live URL, GitHub Actions runs the no-secret [staging smoke workflow](../.github/workflows/staging-api-smoke.yml) from a GitHub-hosted runner, requiring a valid 200 health response, exact JSON readiness fields, no session cookies or wildcard CORS, and denial of protected routes and writes.
- Seven local gateway API tests and five deploy-guard tests provide deterministic coverage without Google accounts or financial data.

## Reproducible, scoped deployment

A reviewed and **separately authorized** Cloudflare API token with Pages Write access is required:

```bash
# Do not paste or commit the token in source, scripts, logs or CLI history.
export CLOUDFLARE_ACCOUNT_ID='your-account-id'
export CLOUDFLARE_STAGING_API_TOKEN='provided-securely-by-your-secret-manager'
node scripts/deploy-staging-pages.mjs --deploy-staging
```

The script checks the staging project and the exact expected D1 and Worker bindings for **both** production and preview of the *staging project* before uploading; it cannot be redirected to the real production Pages project by a command-line argument. Secrets must be set through a secure environment or secret manager and never committed. Automated GitHub Actions deployment must wait for a properly scoped token/connection; the code and test pipeline deliberately do not claim this is already configured.

## Gate to real OAuth/API work

**BLOCKED until proven:** separate OAuth configuration for the staging origin, reviewed callback URI and JavaScript origin, CSRF/cookie/PKCE and scope tests, browser and Google Drive tests with a test account, full Pages Functions build/route validation, synthetic-only D1/R2 integration tests, and backup/restore rehearsal. The current readiness worker must not expose `/auth/google/*`, `/api/posts`, Cashflow writes, payroll data or secrets to the public GitHub Pages origin.

Production remains on `https://duynguyen-reddit-editor.pages.dev/` unchanged. A green static Pages workflow or a deployed staging readiness gateway **never authorizes cutover**.

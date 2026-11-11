# Cloudflare staging isolation — deployed resources and verified smoke tests

Date: 2026-11-11 (Asia/Ho_Chi_Minh)  
Related plan: [Backend Readiness Audit](BACKEND-MIGRATION-READINESS-AUDIT.md).

## Status and hard boundaries

**STAGING INFRASTRUCTURE PROVISIONED AND ISOLATION VERIFIED.** This is **not** a production backend cutover and **not** proof that authenticated routes or the full Editor run in staging. Production `duynguyen-reddit-editor.pages.dev` was not changed.

Provisioned in the same Cloudflare account:

| Component | Staging | Production (different) |
| --- | --- | --- |
| Pages project | `reddit-editor-integration-staging` | `duynguyen-reddit-editor` |
| Cashflow Worker service | `reddit-editor-cashflow-staging` | Existing `CASHFLOW_BACKEND` production target |
| D1 | `reddit-editor-staging-db` (`5dab001b-e703-49bf-974a-35251d630328`) | `tet-dinh-mui-cashflow-db` |
| R2 evidence | `reddit-editor-staging-evidence` | `tet-dinh-mui-cashflow-evidence` |

The **staging Pages project's own** production and preview configurations both point to its isolated staging D1 and staging Worker. This is separate from the **existing production Pages project's preview**, which previously shared production bindings and remains **NOT** safe for write testing.

## Verified Cloudflare actions (real resources)

1. Created a new D1 database and a private R2 bucket, with no copied production rows or objects.
2. Read the live database's **DDL metadata only** via `sqlite_master`, excluding Cloudflare internal `_cf_KV`; applied 10 tables, 2 indexes and 3 triggers to **staging D1 only**. The corresponding structure-only baseline is [`cashflow-backend/staging-schema.sql`](../cashflow-backend/staging-schema.sql).
3. Deployed a separate Worker with six source modules from this repository, bound only to staging `DB` (D1) and `EVIDENCE` (R2). The deployed **staging-only** entrypoint permits GET `/health` and responds `503 staging_http_disabled` on every other HTTP path. Scheduled processing is disabled; no Telegram webhook, admin token, Google bridge or production secret was attached. Service-binding RPC methods remain present but are not available over public HTTP.
4. Created an independent Pages project named `reddit-editor-integration-staging`, with both deployment configs pointing to the newly isolated D1 and Worker. **No frontend or Pages Functions deployment was performed**, no Google OAuth secret was configured, and authenticated end-to-end operation is not yet tested.
5. Re-read Cloudflare configuration and verified **13/13 isolation invariants**: project separation; D1 IDs distinct; Worker service/environment separate; Worker D1/R2 bindings exactly staging; both staging Pages configs isolated; existence of new resources; no Worker secret bindings.
6. Inserted one **synthetic** 100 VND transaction and Telegram inbox row into staging D1, read them back, verified the revision trigger, and deleted them. Confirmed staging D1 returns **zero transactions, zero Telegram rows, zero audit events** afterward.
7. Uploaded a harmless synthetic text object to staging R2, verified byte-exact read-back and deleted it. Confirmed **zero remaining R2 objects** afterward.

No real financial records, payroll PDFs, bank receipts, OAuth credentials or Telegram events were copied or modified. No production D1 SQL write, R2 mutation, Worker update, Pages update, DNS edit or OAuth callback change was performed.

## Reproducible staging Worker build (safe and explicit)

```bash
npm ci
node --test apps/web/test/stagingIsolation.test.mjs
node scripts/build-cashflow-staging.mjs
# Use a separately scoped Cloudflare token for this staging resource only:
cd cashflow-backend
npx wrangler deploy --config wrangler.staging.toml
```

The build script only copies the original Worker and tracked imports into an ignored `.staging-dist/` folder, overriding the **staging copy's HTTP entrypoint** to allow `/health` and disable all other HTTP routes and scheduled invocations. It never overwrites the original `worker.mjs`.

The Wrangler configuration has only staging resource names/IDs and **no secrets**. Keep the Worker `workers.dev` subdomain disabled until a security review explicitly permits exposing the staging health endpoint.

**Important:** Running a Wrangler deploy requires the appropriate Cloudflare authentication and should never use a broad production token in CI. The initial staging Worker was deployed via the authorized connected Cloudflare API; these files provide a reproducible, reviewed build path for future staging updates.

## Remaining gates: start the next PR immediately, not by assuming completion

- [x] Distinct D1, R2, Worker, Pages project and verified bindings.
- [x] D1 schema-only migration, synthetic row and trigger read-back, cleanup.
- [x] R2 synthetic upload/download/cleanup.
- [x] Staging HTTP mutations blocked; cron and Telegram webhook disabled.
- [ ] Deploy the **staging frontend and Pages Functions** behind an appropriate authentication boundary using the new project; currently its URL has no application deployment.
- [ ] Configure a **separate staging Google OAuth Client** or explicitly allow a staging origin in a reviewed OAuth client. Do not reuse production client secrets or skip CSRF/CORS/cookie verification.
- [ ] Test Google auth flows, denied users, expired tokens, and single-origin session semantics before enabling API writes.
- [ ] Test read-only Blogger/GA4 paths first; use non-production identities and test blogs before permitting publish/update/delete.
- [ ] Exercise real 12-page browser flows, Drive sync, Sheets rights, and Payroll synthetic-PDF encryption with no production data.
- [ ] Back up actual production D1/R2 and prove restore to **another isolated target**; obtain owner cutover approval before any production URL/data changes.

**Production remains authoritative.** GitHub Pages is still a public static preview, and its successful 12/12 route smoke checks do not demonstrate OAuth, service-account permissions or end-to-end backend readiness.

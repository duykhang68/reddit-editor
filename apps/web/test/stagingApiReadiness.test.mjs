import assert from 'node:assert/strict';
import { test } from 'node:test';
import stagingGateway from '../../../infra/cloudflare/staging-pages-worker.mjs';

const req = (path, method = 'GET') => new Request('https://reddit-editor-integration-staging.pages.dev' + path, { method });
const env = ({ rows = 0, workerStage = true, r2 = true } = {}) => ({
  CASHFLOW_DB: {
    prepare(sql) {
      if (/cashflow_revision/.test(sql)) return { first: async () => ({ revision: 3 }) };
      if (/transactions/.test(sql)) return { first: async () => ({ count: rows }) };
      throw Error('Unexpected SQL: ' + sql);
    }
  },
  CASHFLOW_BACKEND: {
    async fetch(url) {
      assert.equal(url, 'https://staging-worker.internal/health');
      return new Response(JSON.stringify({
        staging: workerStage,
        ledgerConfigured: true,
        evidenceConfigured: r2
      }), { headers: { 'content-type': 'application/json' } });
    }
  }
});

test('staging same-origin gateway verifies isolated D1 and staging Worker, without exposing secrets', async () => {
  const r = await stagingGateway.fetch(req('/health'), env());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual(j, {
    ok: true, stage: 'isolated', source: 'cloudflare-pages-staging',
    d1Connected: true, transactionsEmpty: true,
    workerConnected: true, workerHasR2: true, authEnabled: false
  });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-robots-tag'), 'noindex,nofollow');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(r.headers.get('set-cookie'), null);
});

test('health fails closed when staging bindings are missing', async () => {
  const r = await stagingGateway.fetch(req('/health'), {});
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, 'staging_binding_missing');
});

test('health fails closed if Worker points away from staging or R2 is missing', async () => {
  for (const options of [{ workerStage: false }, { r2: false }]) {
    const r = await stagingGateway.fetch(req('/api/staging/health'), env(options));
    assert.equal(r.status, 503);
    assert.equal((await r.json()).ok, false);
  }
});

test('health refuses non-empty staging ledger; no production data fallback', async () => {
  const r = await stagingGateway.fetch(req('/health'), env({ rows: 1 }));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).transactionsEmpty, false);
});

test('all staging write operations fail closed without an authenticated backend', async () => {
  for (const path of ['/health', '/api/staging/health', '/cashflow-intelligence/api/save', '/api/expenses-state']) {
    const r = await stagingGateway.fetch(req(path, 'POST'), env());
    assert.equal(r.status, 405);
    assert.equal((await r.json()).error, 'staging_readonly');
  }
});

test('OAuth and production APIs cannot be used through staging gateway', async () => {
  for (const path of ['/auth/google/start', '/auth/google/callback', '/api/posts', '/api/status',
    '/api/ga4-insights', '/cashflow-intelligence/api/ledger', '/telegram/webhook']) {
    const r = await stagingGateway.fetch(req(path), env());
    assert.equal(r.status, 503, path);
    assert.equal((await r.json()).error, 'staging_auth_not_configured');
  }
});

test('staging landing page clearly warns and never serves production Editor UI', async () => {
  const r = await stagingGateway.fetch(req('/'), env());
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await r.text();
  assert.match(html, /Backend Staging/);
  assert.match(html, /OAuth.+API/);
  assert.doesNotMatch(html, /VITE_GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET|ADMIN_API_KEY/);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertIsolatedConfig, deploy, STAGING_PROJECT, STAGING_DB, STAGING_WORKER } from '../../../scripts/deploy-staging-pages.mjs';

function project({ db = STAGING_DB, worker = STAGING_WORKER, previewDb = db, previewWorker = worker, name = STAGING_PROJECT } = {}) {
  return {
    name,
    deployment_configs: {
      production: { d1_databases: { CASHFLOW_DB: { id: db } }, services: { CASHFLOW_BACKEND: { service: worker } } },
      preview: { d1_databases: { CASHFLOW_DB: { id: previewDb } }, services: { CASHFLOW_BACKEND: { service: previewWorker } } }
    }
  };
}

test('staging readiness deploy accepts only isolated Pages project bindings', () => {
  assert.equal(assertIsolatedConfig(project()), true);
});

test('staging readiness deploy refuses production project and production database', () => {
  assert.throws(() => assertIsolatedConfig(project({ name: 'duynguyen-reddit-editor' })), /Not the isolated staging/);
  assert.throws(() => assertIsolatedConfig(project({ db: 'cccc9d27-6260-4f80-85af-dfe5d69a8bb7' })), /D1 binding/);
});

test('staging readiness deploy refuses preview bindings that point back to production', () => {
  assert.throws(() => assertIsolatedConfig(project({ previewDb: 'cccc9d27-6260-4f80-85af-dfe5d69a8bb7' })), /preview D1/);
  assert.throws(() => assertIsolatedConfig(project({ previewWorker: 'tet-dinh-mui-cashflow' })), /preview Cashflow Worker/);
});

test('staging readiness deploy cannot make a network request without explicit credentials', async () => {
  let called = 0;
  await assert.rejects(() => deploy({
    accountId: 'd2228e3f75bc47eff64442ad8a225f85',
    fetcher: async () => { called++; throw Error('MUST_NOT_RUN'); }
  }), /Set CLOUDFLARE_ACCOUNT_ID and scoped/);
  assert.equal(called, 0);
});

test('staging readiness deploy refuses unsafe project before any upload', async () => {
  let calls = 0;
  await assert.rejects(() => deploy({
    accountId: 'd2228e3f75bc47eff64442ad8a225f85',
    token: 'fake-no-network-token',
    fetcher: async () => {
      calls++;
      return { ok: true, json: async () => ({ success: true, result: project({ previewWorker: 'production-backend' }) }) };
    }
  }), /preview Cashflow Worker/);
  assert.equal(calls, 1);
});

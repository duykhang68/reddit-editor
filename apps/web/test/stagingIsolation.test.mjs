import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { makeStagingWorkerSource, buildStagingWorker } from '../../../scripts/build-cashflow-staging.mjs';

const read = path => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const resources = JSON.parse(read('infra/cloudflare/staging-resources.json'));

test('staging resources are explicit and cannot be confused with production', () => {
  assert.equal(resources.environment, 'staging');
  assert.equal(resources.cloudflarePagesProject, 'reddit-editor-integration-staging');
  assert.equal(resources.cashflowWorker, 'reddit-editor-cashflow-staging');
  assert.equal(resources.d1.name, 'reddit-editor-staging-db');
  assert.equal(resources.r2.name, 'reddit-editor-staging-evidence');
  assert.equal(resources.productionPageProjectForbidden, 'duynguyen-reddit-editor');
  assert.notEqual(resources.productionPageProjectForbidden, resources.cloudflarePagesProject);
  assert.match(resources.d1.databaseId, /^[0-9a-f-]{36}$/i);
  assert.equal(resources.r2.publicAccess, false);
  assert.equal(resources.workerHttpPolicy, 'health-only');
  assert.equal(resources.workerScheduledProcessing, false);
  assert.equal(resources.workerSecretsConfigured, false);
  assert.equal(resources.productionDataCopied, false);
  assert.equal(resources.stagingFrontendDeployed, false);
});

test('Wrangler stages only to the provisioned D1 and R2 resources', () => {
  const cfg = read('cashflow-backend/wrangler.staging.toml');
  assert.match(cfg, /name = "reddit-editor-cashflow-staging"/);
  assert.ok(cfg.includes('database_id = "' + resources.d1.databaseId + '"'));
  assert.ok(cfg.includes('database_name = "' + resources.d1.name + '"'));
  assert.ok(cfg.includes('bucket_name = "' + resources.r2.name + '"'));
  assert.match(cfg, /workers_dev = false/);
  assert.match(cfg, /preview_urls = false/);
  assert.doesNotMatch(cfg, /tet-dinh-mui-cashflow-(?:db|evidence)/);
  assert.doesNotMatch(cfg, /TELEGRAM_BOT_TOKEN|GOOGLE_CLIENT_SECRET|APP_SECRET/);
});

test('staging source fails closed for HTTP and disables scheduled processing', () => {
  const original = read('cashflow-backend/worker.mjs');
  const staging = makeStagingWorkerSource(original);
  assert.notEqual(staging, original);
  assert.match(staging, /staging_http_disabled/);
  assert.match(staging, /u.pathname==='\/health'/);
  assert.match(staging, /scheduled\(\)\{return undefined\}/);
  assert.match(staging, /async previewReceipt\(/);
  assert.match(staging, /async reprocessReceipt\(/);
  assert.throws(() => makeStagingWorkerSource(staging), /entrypoint no longer matches/);
});

test('staging schema contains structure but never production rows', () => {
  const ddl = read('cashflow-backend/staging-schema.sql');
  for (const table of ['telegram_inbox', 'transactions', 'app_config', 'audit_events',
    'sync_outbox', 'cashflow_curation', 'cashflow_revision']) {
    assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS ' + table), table);
  }
  assert.match(ddl, /CREATE TRIGGER IF NOT EXISTS cashflow_tx_insert/);
  assert.match(ddl, /CREATE INDEX IF NOT EXISTS idx_transactions_status/);
  assert.match(ddl, /INSERT OR IGNORE INTO cashflow_revision\(id,revision\) VALUES\(1,1\)/);
  assert.doesNotMatch(ddl, /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(?:transactions|telegram_inbox|audit_events)/i);
  assert.doesNotMatch(ddl, /_cf_KV/gi);
});

test('staging Worker build copies only tracked source modules', async () => {
  const bundle = await buildStagingWorker();
  assert.equal(bundle.copiedModules, 5);
  assert.equal(bundle.httpPolicy, 'health-only');
  assert.equal(bundle.scheduledDisabled, true);
  const source = readFileSync(bundle.path + '/worker.mjs', 'utf8');
  assert.match(source, /staging_http_disabled/);
  assert.ok(source.includes("import {WorkerEntrypoint} from 'cloudflare:workers'"));
});

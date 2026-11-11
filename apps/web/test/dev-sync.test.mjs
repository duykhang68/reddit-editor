import assert from 'node:assert/strict';
import test from 'node:test';
import { updatePlan, pollInterval } from '../../../scripts/dev-sync.mjs';

test('source changes use HMR without restarting dev server', () => {
  assert.deepEqual(updatePlan(['apps/web/src/App.jsx', 'apps/server/lib.mjs']), {
    install: false, restart: false
  });
});

test('package updates reinstall and restart', () => {
  for (const file of ['package-lock.json', 'package.json', 'apps/web/package.json', 'apps/server/package.json']) {
    assert.deepEqual(updatePlan([file]), { install: true, restart: true });
  }
});

test('vite config or dev launcher update restarts without reinstalling', () => {
  for (const file of ['scripts/dev.mjs', 'apps/web/vite.config.js']) {
    assert.deepEqual(updatePlan([file]), { install: false, restart: true });
  }
});

test('poll interval is bounded', () => {
  assert.equal(pollInterval(undefined), 20_000);
  assert.equal(pollInterval('5000'), 5_000);
  assert.equal(pollInterval('300000'), 300_000);
  assert.equal(pollInterval('10'), 20_000);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveDriveClientId} from '../src/services/driveClientId.js';

const cloudClient = 'cloud-123.apps.googleusercontent.com';
const oldManual = 'old-456.apps.googleusercontent.com';

test('configured Cloudflare/Vite Client ID overrides an older localStorage value', () => {
  assert.deepEqual(resolveDriveClientId('  ' + cloudClient + '  ', oldManual), {
    clientId: cloudClient,
    configured: true
  });
});

test('manual Client ID is available when build environment is not configured', () => {
  assert.deepEqual(resolveDriveClientId('', oldManual), {
    clientId: oldManual,
    configured: false
  });
  assert.deepEqual(resolveDriveClientId('   ', '  ' + oldManual + '  '), {
    clientId: oldManual,
    configured: false
  });
});

test('missing configuration leaves manual input available', () => {
  assert.deepEqual(resolveDriveClientId(undefined, null), {
    clientId: '',
    configured: false
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discoverExpenseDriveClientId,EDITOR_DRIVE_CLIENT_KEY} from '../src/expenses/driveClientResolver.js';

const buildId='111111-build.apps.googleusercontent.com';
const storedId='222222-local.apps.googleusercontent.com';
const runtimeId='333333-server.apps.googleusercontent.com';
const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});

test('Editor Drive Client ID prefers valid Vite build configuration',async()=>{
  const result=await discoverExpenseDriveClientId({
    environmentValue:buildId,storedValue:storedId,
    fetcher:()=>{throw Error('Runtime fetch must not run');}
  });
  assert.equal(result.clientId,buildId);
  assert.equal(result.source,'build');
});

test('Editor Drive Client ID recovers saved public ID from the same browser',async()=>{
  const result=await discoverExpenseDriveClientId({
    environmentValue:'',storedValue:storedId,
    fetcher:()=>{throw Error('Runtime fetch must not run');}
  });
  assert.equal(result.clientId,storedId);
  assert.equal(EDITOR_DRIVE_CLIENT_KEY,'dn-editor-drive-client-id');
});

test('Editor Drive Client ID falls back to Cloudflare runtime config if no built-in or saved ID',async()=>{
  const requests=[];
  const result=await discoverExpenseDriveClientId({
    environmentValue:'NOT_A_WEB_CLIENT_ID',
    storedValue:'',
    fetcher:async (...args)=>{requests.push(args);return response({clientId:runtimeId});}
  });
  assert.equal(result.clientId,runtimeId);
  assert.equal(result.source,'backend');
  assert.equal(requests[0][0],'/api/drive-client-config');
  assert.equal(requests[0][1].cache,'no-store');
});

test('Missing runtime config does not invent a client ID',async()=>{
  const result=await discoverExpenseDriveClientId({
    environmentValue:'',storedValue:'',
    fetcher:async()=>response({clientId:''})
  });
  assert.equal(result.clientId,'');
  assert.equal(result.source,'missing');
  assert.ok(result.error);
});

test('DrivePanel resolves config on mount before the user clicks GIS login',()=>{
  const source=readFileSync(new URL('../src/DrivePanel.jsx',import.meta.url),'utf8');
  assert.match(source,/discoverExpenseDriveClientId\(/);
  assert.match(source,/environmentValue:import\.meta\.env\.VITE_GOOGLE_CLIENT_ID/);
  assert.match(source,/storedValue:manualClientId/);
  assert.match(source,/clientConfig\.loading/);
  assert.match(source,/!validClientId\(clientId\)/);
  assert.match(source,/await googleDrive\.login\(clientId\.trim\(\)\)/);
  assert.match(source,/setShowClientInput\(!validClientId\(result\.clientId\)\)/);
  assert.match(source,/Dùng Client ID tự động/);
  assert.match(source,/localStorage\.setItem\(clientKey, clientId\.trim\(\)\)/);
  assert.doesNotMatch(source,/resolveDriveClientId\(import\.meta\.env\.VITE_GOOGLE_CLIENT_ID, manualClientId\)/);
});

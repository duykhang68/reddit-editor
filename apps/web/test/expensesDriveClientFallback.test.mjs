import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/[[path]].js';
import {discoverExpenseDriveClientId,validClientId,DRIVE_CONFIG_URL,EDITOR_DRIVE_CLIENT_KEY} from '../src/expenses/driveClientResolver.js';

const build='111111-abc.apps.googleusercontent.com';
const editor='222222-def.apps.googleusercontent.com';
const server='333333-ghi.apps.googleusercontent.com';
const endpoint='https://duynguyen-reddit-editor.pages.dev/api/drive-client-config';
const response=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'Content-Type':'application/json'}
});

test('Expenses automatically prefers configured Vite Client ID; no extra network',async()=>{
  let called=0;
  const resolved=await discoverExpenseDriveClientId({
    environmentValue:' '+build+' ',storedValue:editor,
    fetcher:()=>{called++;throw Error('Should not fetch');}
  });
  assert.equal(resolved.clientId,build);
  assert.equal(resolved.source,'build');
  assert.equal(called,0);
});
test('Expenses reuses Editor saved public Client ID if no Vite env',async()=>{
  const resolved=await discoverExpenseDriveClientId({
    environmentValue:'',storedValue:editor,
    fetcher:()=>{throw Error('Should not fetch');}
  });
  assert.equal(resolved.clientId,editor);
  assert.equal(resolved.source,'editor');
  assert.equal(EDITOR_DRIVE_CLIENT_KEY,'dn-editor-drive-client-id');
});
test('Invalid Vite value cannot mask the existing Editor Client ID',async()=>{
  const resolved=await discoverExpenseDriveClientId({
    environmentValue:'REPLACE_ME',storedValue:editor,
    fetcher:()=>{throw Error('Should not need API');}
  });
  assert.equal(resolved.clientId,editor);
  assert.equal(resolved.source,'editor');
});
test('Expenses falls back to same-origin backend OAuth config without login',async()=>{
  const calls=[];
  const resolved=await discoverExpenseDriveClientId({
    environmentValue:'not-valid',storedValue:'',
    fetcher:async (url,options)=>{
      calls.push({url,options});
      return response({clientId:server,configured:true,source:'editor'});
    }
  });
  assert.equal(resolved.clientId,server);
  assert.equal(resolved.source,'backend');
  assert.equal(calls[0].url,DRIVE_CONFIG_URL);
  assert.equal(calls[0].options.credentials,'same-origin');
  assert.equal(calls[0].options.cache,'no-store');
});
test('Missing or invalid backend ID uses explicit recoverable UI instead of a false connected status',async()=>{
  for(const option of [
    {fetcher:async()=>response({clientId:''})},
    {fetcher:async()=>response({clientId:'not-an-id'})},
    {fetcher:async()=>response({},503)},
    {fetcher:async()=>{throw Error('network down');}}
  ]){
    const result=await discoverExpenseDriveClientId({
      environmentValue:'',storedValue:'',...option
    });
    assert.equal(result.clientId,'');
    assert.equal(result.source,'missing');
    assert.ok(result.error.length>10);
  }
  assert.equal(validClientId('123.apps.googleusercontent.com'),true);
  assert.equal(validClientId('not-client-id'),false);
});
test('Public API returns only the web OAuth Client ID, without secrets or session details',async()=>{
  const env={
    GOOGLE_CLIENT_ID:server,
    GOOGLE_CLIENT_SECRET:'must-never-expose-secret',
    APP_SECRET:'must-never-expose-app-secret'
  };
  const res=await onRequest({request:new Request(endpoint),env});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('Cache-Control'),'no-store');
  const json=await res.json();
  assert.deepEqual(json,{clientId:server,configured:true,source:'editor'});
  assert.ok(!JSON.stringify(json).includes('must-never-expose'));
});
test('Dedicated Google Drive Client ID wins over Blogger OAuth and no ID yields empty public config',async()=>{
  const env={GOOGLE_CLIENT_ID:server,GOOGLE_DRIVE_CLIENT_ID:editor,GOOGLE_CLIENT_SECRET:'secret'};
  const res=await onRequest({request:new Request(endpoint),env});
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{clientId:editor,configured:true,source:'drive'});
  const empty=await onRequest({request:new Request(endpoint),env:{GOOGLE_CLIENT_ID:'invalid'}});
  assert.deepEqual(await empty.json(),{clientId:'',configured:false,source:'editor'});
  const badMethod=await onRequest({request:new Request(endpoint,{method:'POST'}),env:{}});
  assert.equal(badMethod.status,405);
});
test('Standalone Expenses fetches OAuth config before click and exposes manual recovery input',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const hook=read('../src/expenses/useExpenseDriveSync.js');
  const page=read('../src/expenses/Expenses.jsx');
  assert.match(hook,/discoverExpenseDriveClientId/);
  assert.match(hook,/environmentValue:import\.meta\.env\.VITE_GOOGLE_CLIENT_ID/);
  assert.match(hook,/await googleDrive\.login\(clientId\)/);
  assert.match(hook,/EDITOR_DRIVE_CLIENT_KEY/);
  assert.match(page,/Kết nối Google Drive/);
  assert.match(page,/ex-drive-client-id/);
  assert.match(page,/Đồng bộ ngay/);
  assert.doesNotMatch(hook,/Chưa có VITE_GOOGLE_CLIENT_ID\. Cấu hình Client ID giống Editor/);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {onRequest} from '../functions/[[path]].js';
import {emptyData,newCategory} from '../src/expenses/model.js';
import {loadExpenseCloud,writeExpenseCloud} from '../src/expenses/cloudStore.mjs';
import {planSync,snapshotFingerprint,SYNC_INTERVAL_MS} from '../src/expenses/cloudSync.js';

class TestD1 {
  constructor(){this.records=new Map();}
  prepare(sql){
    const store=this.records;
    let args=[];
    return {
      bind(...values){args=values;return this;},
      async run(){
        if(sql.startsWith('CREATE TABLE'))return {meta:{changes:0}};
        if(sql.startsWith('INSERT INTO')){
          const [owner,payload,updatedAt]=args;
          if(store.has(owner))return {meta:{changes:0}};
          store.set(owner,{revision:1,payload,updated_at:updatedAt});
          return {meta:{changes:1}};
        }
        if(sql.startsWith('UPDATE ')){
          const [payload,updatedAt,owner,expected]=args;
          const row=store.get(owner);
          if(!row||row.revision!==expected)return {meta:{changes:0}};
          store.set(owner,{revision:row.revision+1,payload,updated_at:updatedAt});
          return {meta:{changes:1}};
        }
        throw new Error('Unexpected SQL: '+sql);
      },
      async first(){
        if(!sql.startsWith('SELECT '))throw new Error('Unexpected SELECT: '+sql);
        const row=store.get(args[0]);
        return row?{...row}:null;
      }
    };
  }
}
const item=(id,amount)=>({id,date:'2026-11-07',categoryId:'food',amount,note:'Chi tiêu'});

test('D1 snapshot is owner-scoped and uses safe revision compare-and-swap',async()=>{
  const db=new TestD1();
  const data={...emptyData(),transactions:[item('one',45000)]};
  assert.deepEqual(await loadExpenseCloud({db,ownerId:'100'}),{exists:false,revision:0,updatedAt:null,data:null});
  assert.equal((await writeExpenseCloud({db,ownerId:'100',expectedRevision:0,data})).revision,1);
  assert.equal((await loadExpenseCloud({db,ownerId:'100'})).data.transactions[0].amount,45000);
  assert.equal((await loadExpenseCloud({db,ownerId:'200'})).exists,false);
  await assert.rejects(()=>writeExpenseCloud({db,ownerId:'100',expectedRevision:0,data}),err=>err.status===409);
  const revised={...data,transactions:[item('one',90000)]};
  assert.equal((await writeExpenseCloud({db,ownerId:'100',expectedRevision:1,data:revised})).revision,2);
  await assert.rejects(()=>writeExpenseCloud({db,ownerId:'100',expectedRevision:1,data}),err=>err.status===409);
  assert.equal((await loadExpenseCloud({db,ownerId:'100'})).data.transactions[0].amount,90000);
  assert.equal((await writeExpenseCloud({db,ownerId:'200',expectedRevision:0,data})).revision,1);
  assert.equal((await loadExpenseCloud({db,ownerId:'200'})).data.transactions[0].amount,45000);
});
test('D1 rejects unconfigured bindings, invalid data and account IDs',async()=>{
  const db=new TestD1();
  await assert.rejects(()=>loadExpenseCloud({db:null,ownerId:'100'}),err=>err.status===503&&err.code==='EXPENSES_DB_MISSING');
  await assert.rejects(()=>loadExpenseCloud({db,ownerId:'spoofed'}),err=>err.status===502);
  await assert.rejects(()=>writeExpenseCloud({db,ownerId:'100',expectedRevision:-1,data:emptyData()}),err=>err.status===400);
  await assert.rejects(()=>writeExpenseCloud({db,ownerId:'100',expectedRevision:0,data:{...emptyData(),transactions:[item('x',-1)]}}),err=>err.status===400);
});
test('Sync planning recovers cloud on fresh device, uploads local data and refuses ambiguous overwrites',()=>{
  const empty=emptyData();
  const saved={...emptyData(),transactions:[item('a',45000)]};
  const altered={...emptyData(),transactions:[item('a',65000)]};
  const remote={ownerId:'100',exists:true,revision:2,data:saved,updatedAt:'2026-11-07T00:00:00Z'};
  const meta={ownerId:'100',revision:2,fingerprint:snapshotFingerprint(saved)};
  assert.equal(SYNC_INTERVAL_MS,180000);
  assert.equal(planSync({localData:empty,remote,meta:null}).action,'pull');
  assert.equal(planSync({localData:saved,remote,meta}).action,'equal');
  assert.equal(planSync({localData:altered,remote,meta}).action,'push');
  assert.equal(planSync({localData:saved,remote:{...remote,revision:3,data:altered},meta}).action,'pull');
  assert.equal(planSync({localData:altered,remote:{...remote,revision:3},meta}).action,'conflict');
  assert.equal(planSync({localData:altered,remote,meta:null}).action,'conflict');
  assert.equal(planSync({localData:altered,remote:{...remote,exists:false,data:null,revision:0},meta:null}).action,'push');
  assert.equal(planSync({localData:altered,remote:{...remote,exists:false,data:null,revision:0},meta}).action,'conflict');
  assert.equal(planSync({localData:altered,remote,meta:{...meta,ownerId:'different'}}).action,'conflict');
});
test('Sync planning respects custom categories and monthly budgets, not just transactions',()=>{
  const custom=newCategory('Nuôi thú cưng');
  const data={...emptyData(),transactions:[],customCategories:[custom],budgets:{'2026-11':{total:100000,categories:{[custom.id]:50000}}}};
  assert.equal(planSync({localData:data,remote:{ownerId:'100',exists:false,revision:0,data:null},meta:null}).action,'push');
  assert.notEqual(snapshotFingerprint(emptyData()),snapshotFingerprint(data));
});

const base='https://editor.example';
const envBase={
  GOOGLE_CLIENT_ID:'example.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET:'test-only',
  GOOGLE_REDIRECT_URI:base+'/auth/google/callback',
  FRONTEND_ORIGIN:base,
  APP_SECRET:'a'.repeat(64)
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('Cloudflare HTTP route requires Google session and CSRF, with safe D1 errors',async t=>{
  const db=new TestD1();
  const mocked=t.mock.method(globalThis,'fetch',async(input,opts={})=>{
    const url=new URL(String(input));
    if(url.hostname==='oauth2.googleapis.com'){
      const form=new URLSearchParams(String(opts.body));
      const code=form.get('code')||'first';
      return json({access_token:'access-'+code,refresh_token:'refresh-'+code,expires_in:3600});
    }
    if(url.pathname==='/blogger/v3/users/self'){
      const header=opts.headers?.Authorization||'';
      return json({id:header.includes('second')?'200':'100'});
    }
    throw new Error('Unexpected external URL: '+url);
  });
  const env={...envBase,EXPENSES_DB:db};
  const call=(path,cookie='',opts={})=>onRequest({
    request:new Request(base+path,{...opts,headers:{...(cookie?{Cookie:cookie}:{}),...(opts.headers||{})}}),env
  });
  const session=async code=>{
    const status=await call('/api/status');
    const visitor=status.headers.get('set-cookie').split(';')[0];
    const start=await call('/auth/google/start?return_to=expenses',visitor);
    const loginUrl=new URL(start.headers.get('location'));
    const flowCookie=start.headers.get('set-cookie').split(';')[0];
    const callback=await call('/auth/google/callback?state='+encodeURIComponent(loginUrl.searchParams.get('state'))+'&code='+code,flowCookie);
    assert.equal(callback.status,302);
    assert.equal(callback.headers.get('location'),base+'/expenses/?connected=1');
    const authCookie=callback.headers.get('set-cookie').split(';')[0];
    const connected=await call('/api/status',authCookie);
    return {cookie:connected.headers.get('set-cookie').split(';')[0],csrf:(await connected.json()).csrf};
  };
  try{
    assert.equal((await call('/api/expenses-state')).status,401);
    const user1=await session('first');
    const empty=await call('/api/expenses-state',user1.cookie);
    assert.equal(empty.status,200);
    assert.equal((await empty.json()).revision,0);
    const data={...emptyData(),transactions:[item('a',45000)]};
    const payload=JSON.stringify({expectedRevision:0,data});
    const missingCsrf=await call('/api/expenses-state',user1.cookie,{method:'PUT',headers:{Origin:base,'Content-Type':'application/json'},body:payload});
    assert.equal(missingCsrf.status,403);
    const missingOrigin=await call('/api/expenses-state',user1.cookie,{method:'PUT',headers:{'X-CSRF-Token':user1.csrf,'Content-Type':'application/json'},body:payload});
    assert.equal(missingOrigin.status,403);
    const good=await call('/api/expenses-state',user1.cookie,{method:'PUT',headers:{Origin:base,'Content-Type':'application/json','X-CSRF-Token':user1.csrf},body:payload});
    assert.equal(good.status,200,await good.clone().text());
    assert.equal((await good.json()).revision,1);
    const stale=await call('/api/expenses-state',user1.cookie,{method:'PUT',headers:{Origin:base,'Content-Type':'application/json','X-CSRF-Token':user1.csrf},body:payload});
    assert.equal(stale.status,409);
    assert.equal((await stale.json()).code,'EXPENSES_CONFLICT');
    const one=await call('/api/expenses-state',user1.cookie);
    assert.equal((await one.json()).data.transactions[0].amount,45000);

    const user2=await session('second');
    const other=await call('/api/expenses-state',user2.cookie);
    assert.equal((await other.json()).exists,false);
    const otherWrite=await call('/api/expenses-state',user2.cookie,{method:'PUT',headers:{Origin:base,'Content-Type':'application/json','X-CSRF-Token':user2.csrf},body:payload});
    assert.equal(otherWrite.status,200);
    assert.equal(db.records.size,2);
    const noDb=await onRequest({request:new Request(base+'/api/expenses-state',{headers:{Cookie:user1.cookie}}),env:envBase});
    assert.equal(noDb.status,503);
    assert.equal((await noDb.json()).code,'EXPENSES_DB_MISSING');
  }finally{mocked.mock.restore();}
});
test('Legacy Cloudflare D1 endpoint is not used by the Expenses page',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const page=read('../src/expenses/Expenses.jsx');
  const hook=read('../src/expenses/useExpenseDriveSync.js');
  assert.match(page,/Đồng bộ ngay/);
  assert.match(page,/Google Drive/);
  assert.match(page,/resolveConflict\('drive'\)/);
  assert.match(page,/resolveConflict\('local'\)/);
  assert.match(hook,/setInterval\(\(\)=>\{/);
  assert.match(hook,/SYNC_INTERVAL_MS/);
  assert.doesNotMatch(page,/useExpenseCloudSync|Cloudflare D1|Lần lưu Cloudflare/);
  assert.doesNotMatch(hook,/\/api\/expenses-state|\/api\/status/);
});

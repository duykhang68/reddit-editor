import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDriveService,DRIVE_SCOPE} from '../src/services/googleDriveService.js';
import {
  emptyData,normalizeData,snapshotFingerprint,hasUserData,planDriveSync,
  readDriveSyncMeta,writeDriveSyncMeta,DRIVE_SYNC_KEY,SYNC_INTERVAL_MS,SHORT_SYNC_DELAY_MS
} from '../src/starbucks-insights/driveSync.js';

const receipt = {
  id:'receipt-001',date:'2026-11-07',store:'Sora Mall',orderId:'000147006',
  item:'Pure Matcha Latte',baseAmount:80000,extraAmount:5000,
  extraReason:'Half & Half',discountAmount:10000,discountReason:'Ưu đãi hội viên',
  amount:75000,fee:0,cups:1,payment:'pos',
  eligible:true,identified:true,linked:false,excluded:false
};
const base={transactions:[receipt],config:{
  cycleStart:'2026-08-18',tier:'gold',membershipAdjustment:1.25,
  rewardsAdjustment:2.5,redeemed:3
}};
const changed={...base,transactions:[{...receipt,extraAmount:10000,amount:80000}]};
const date='2026-11-07T03:00:00.000Z';
const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});

function mockDrive() {
  let counter=0;
  const files=[{
    metadata:{id:'expenses-1',createdTime:date,modifiedTime:date,version:'1',
      appProperties:{dn_expenses:'snapshot_v1',base_id:'root'}},
    content:'{"kind":"duynguyen-expenses-snapshot-v1","data":{"transactions":[]}}'
  }];
  const calls=[];
  const service=createDriveService({
    now:()=>Date.parse(date),
    oauth:()=>({
      initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'example',expires_in:3600})}),
      hasGrantedAllScopes:()=>true
    }),
    fetcher:async(input,init={})=>{
      const u=new URL(String(input));
      calls.push({url:u.toString(),method:init.method||'GET'});
      if(u.pathname.endsWith('/about'))return response({user:{permissionId:'owner-1'}});
      if(u.pathname==='/drive/v3/files'&&(!init.method||init.method==='GET')){
        const q=u.searchParams.get('q')||'';
        const key=q.includes("'dn_starbucks'")?'dn_starbucks':'dn_expenses';
        return response({files:files.filter(file=>file.metadata.appProperties[key]).map(file=>file.metadata)});
      }
      if(u.pathname==='/upload/drive/v3/files'&&init.method==='POST'){
        const raw=await init.body.text();
        const boundary=init.headers['Content-Type'].split('boundary=')[1];
        const sections=raw.split('--'+boundary).filter(part=>part.includes('\r\n\r\n'));
        assert.equal(sections.length,2);
        const metadata=JSON.parse(sections[0].split('\r\n\r\n')[1].trim());
        const body=sections[1].split('\r\n\r\n')[1].trim();
        const envelope=JSON.parse(body);
        assert.equal(envelope.kind,'duynguyen-starbucks-snapshot-v1');
        assert.equal(metadata.appProperties.dn_starbucks,'snapshot_v1');
        assert.equal(metadata.appProperties.dn_expenses,undefined);
        const id='starbucks-'+(++counter);
        const stamp=new Date(Date.parse(date)+counter*1000).toISOString();
        const file={metadata:{...metadata,id,createdTime:stamp,modifiedTime:stamp,version:'1'},content:body};
        files.push(file);
        return response(file.metadata);
      }
      if(u.pathname.startsWith('/drive/v3/files/')&&u.searchParams.get('alt')==='media'){
        const id=decodeURIComponent(u.pathname.slice('/drive/v3/files/'.length));
        const file=files.find(file=>file.metadata.id===id);
        if(file)return new Response(file.content,{status:200});
      }
      throw Error('Unexpected Google Drive mock URL: '+u.toString());
    }
  });
  return {service,files,calls};
}

test('Starbucks backup keeps order, all receipt amounts and Rewards config',()=>{
  const normalized=normalizeData(base);
  assert.deepEqual(normalized.transactions[0],receipt);
  assert.deepEqual(normalized.config,base.config);
  assert.equal(normalizeData({transactions:[receipt]}).transactions[0].orderId,'000147006');
  assert.equal(normalizeData({transactions:[receipt]}).transactions[0].discountReason,'Ưu đãi hội viên');
  assert.throws(()=>normalizeData({transactions:[receipt,receipt]}),/trùng/);
  assert.throws(()=>normalizeData({transactions:[{...receipt,amount:123}]}),/thực trả/);
  assert.equal(hasUserData(base),true);
  assert.equal(hasUserData({...emptyData(),config:{...emptyData().config,tier:'gold'}}),true);
  assert.equal(SYNC_INTERVAL_MS,180000);
  assert.equal(SHORT_SYNC_DELAY_MS,12000);
});

test('isolated immutable Drive snapshots can be restored across devices',async()=>{
  const f=mockDrive();await f.service.login('123.apps.googleusercontent.com');
  assert.equal(DRIVE_SCOPE,'https://www.googleapis.com/auth/drive.file');
  const initial=await f.service.readStarbucksState();
  assert.equal(initial.exists,false);
  assert.equal(initial.ownerId,'owner-1');
  assert.equal((await f.service.listExpenseSnapshots()).length,1,'Expenses backup remains isolated');
  const first=await f.service.saveStarbucksSnapshot(base,'');
  assert.match(first.fileName,/^DuyNguyen-Starbucks-.*\.json$/);
  assert.equal(first.data.transactions[0].baseAmount,80000);
  assert.equal(first.data.transactions[0].extraAmount,5000);
  assert.equal(first.data.transactions[0].discountAmount,10000);
  assert.equal(first.data.transactions[0].orderId,'000147006');
  assert.equal(first.data.config.membershipAdjustment,1.25);
  const loaded=await f.service.readStarbucksState();
  assert.deepEqual(loaded.data,normalizeData(base));
  assert.deepEqual(loaded.ancestorIds,[]);
  const second=await f.service.saveStarbucksSnapshot(changed,first.snapshotId);
  assert.deepEqual((await f.service.readStarbucksState()).ancestorIds,[first.snapshotId]);
  assert.equal(f.files.length,3,'1 Expenses + 2 immutable Starbucks backups');
  assert.equal(f.files.find(x=>x.metadata.id===first.snapshotId).content.includes('75000'),true);
  await assert.rejects(()=>f.service.saveStarbucksSnapshot(base,first.snapshotId),error=>error.code==='STARBUCKS_CONFLICT');
  assert.equal(f.files.length,3);
  assert.equal(f.calls.filter(call=>call.method==='POST').length,2);
});

test('planner handles restore, edits, forks, new account and no blind overwrite',()=>{
  const remote={exists:true,ownerId:'owner-1',snapshotId:'starbucks-1',data:base,ancestorIds:[]};
  const meta={ownerId:'owner-1',fileId:'starbucks-1',fingerprint:snapshotFingerprint(base)};
  assert.equal(planDriveSync({localData:emptyData(),localMissing:true,remote,meta:null}).action,'pull');
  assert.equal(planDriveSync({localData:base,remote,meta}).action,'equal');
  assert.equal(planDriveSync({localData:changed,remote,meta}).action,'push');
  assert.equal(planDriveSync({localData:base,remote:{...remote,data:changed,snapshotId:'starbucks-2',ancestorIds:['starbucks-1']},meta}).action,'pull');
  assert.equal(planDriveSync({localData:changed,remote:{...remote,data:base,snapshotId:'fork-1',ancestorIds:[]},meta}).action,'conflict');
  assert.equal(planDriveSync({localData:changed,remote:{...remote,data:changed,snapshotId:'starbucks-2',ancestorIds:['starbucks-1']},meta}).action,'equal');
  assert.equal(planDriveSync({localData:changed,remote:{...remote,data:{...base,config:{...base.config,tier:'green'}},snapshotId:'starbucks-2',ancestorIds:['starbucks-1']},meta}).action,'conflict');
  assert.equal(planDriveSync({localData:base,remote:{...remote,ownerId:'owner-2'},meta}).action,'conflict');
  assert.equal(planDriveSync({localData:base,remote,meta:null}).action,'equal');
  assert.equal(planDriveSync({localData:base,remote:{ownerId:'owner-1',exists:false,snapshotId:'',data:null},meta:null}).action,'push');
});

test('Starbucks sync metadata has its own key and preserves Expenses metadata',()=>{
  const values=new Map([['dn-daily-expenses-drive-sync-v1','{"ownerId":"old"}']]);
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  assert.equal(readDriveSyncMeta(storage),null);
  writeDriveSyncMeta(storage,{ownerId:'owner-1',snapshotId:'starbucks-1',updatedAt:date},snapshotFingerprint(base));
  assert.equal(readDriveSyncMeta(storage).fileId,'starbucks-1');
  assert.equal(values.has('dn-daily-expenses-drive-sync-v1'),true);
  assert.equal(values.has(DRIVE_SYNC_KEY),true);
});

test('Starbucks standalone UI wires OAuth, manual and 3-minute sync, no secrets',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const html=read('../starbucks-insights/index.html');
  const jsx=read('../src/starbucks-insights/StarbucksInsights.jsx');
  const hook=read('../src/starbucks-insights/useStarbucksDriveSync.js');
  assert.match(html,/accounts\.google\.com\/gsi\/client/);
  assert.match(jsx,/Đồng bộ ngay/);
  assert.match(jsx,/Kết nối Google Drive/);
  assert.match(jsx,/Sao lưu local &amp; khôi phục Drive/);
  assert.match(hook,/environmentValue:import\.meta\.env\.VITE_GOOGLE_CLIENT_ID/);
  assert.match(hook,/readStarbucksState/);
  assert.match(hook,/saveStarbucksSnapshot/);
  assert.match(hook,/setInterval/);
  assert.doesNotMatch(hook,/client_secret|refresh_token/);
});

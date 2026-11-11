import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDriveService,DRIVE_SCOPE} from '../src/services/googleDriveService.js';
import {emptyData,newCategory} from '../src/expenses/model.js';
import {DRIVE_SYNC_KEY,SYNC_INTERVAL_MS,SHORT_SYNC_DELAY_MS,planDriveSync,
  readDriveSyncMeta,writeDriveSyncMeta,snapshotFingerprint} from '../src/expenses/driveSync.js';

const base={...emptyData(),transactions:[{id:'a',date:'2026-11-07',amount:45000,categoryId:'coffee',note:'Cà phê sáng'}]};
const changed={...emptyData(),transactions:[{...base.transactions[0],amount:58000}]};
const date='2026-11-07T03:00:00.000Z';

function mockDrive() {
  let files=[],serial=0,requests=[];
  const service=createDriveService({
    now:()=>Date.parse(date),
    oauth:()=>({
      initTokenClient:options=>({requestAccessToken:()=>{
        options.callback({access_token:'fixture-token',expires_in:3600});
      }}),
      hasGrantedAllScopes:()=>true
    }),
    fetcher:async(input,init={})=>{
      const url=new URL(String(input));
      requests.push({url:url.toString(),method:init.method||'GET',headers:init.headers});
      if(url.pathname.endsWith('/about'))return new Response(JSON.stringify({user:{permissionId:'drive-owner-1'}}),{status:200});
      if(url.pathname.endsWith('/drive/v3/files')&&url.hostname==='www.googleapis.com'&&init.method!=='POST'){
        const list=files.map(f=>f.metadata).sort((a,b)=>b.createdTime.localeCompare(a.createdTime)||b.id.localeCompare(a.id));
        return new Response(JSON.stringify({files:list}),{status:200,headers:{'Content-Type':'application/json'}});
      }
      if(url.pathname==='/upload/drive/v3/files'&&init.method==='POST'){
        const raw=await init.body.text();
        const boundary=init.headers['Content-Type'].split('boundary=')[1];
        const sections=raw.split('--'+boundary).filter(p=>p.includes('\r\n\r\n'));
        assert.equal(sections.length,2);
        const metadata=JSON.parse(sections[0].split('\r\n\r\n')[1].trim());
        const body=sections[1].split('\r\n\r\n')[1].trim();
        const payload=JSON.parse(body);
        assert.equal(payload.kind,'duynguyen-expenses-snapshot-v1');
        const id='snapshot-'+(++serial);
        const file={
          metadata:{...metadata,id,createdTime:new Date(Date.parse(date)+serial*1000).toISOString(),
            modifiedTime:new Date(Date.parse(date)+serial*1000).toISOString(),version:'1'},
          content:body
        };
        files.push(file);
        return new Response(JSON.stringify(file.metadata),{status:200});
      }
      const file=files.find(f=>url.pathname==='/drive/v3/files/'+f.metadata.id);
      if(file&&url.searchParams.get('alt')==='media')return new Response(file.content,{status:200});
      throw Error('Unknown mock Drive request: '+url);
    }
  });
  return {service,requests,files};
}

test('reuse the same Editor OAuth Drive scope and verify immutable JSON save/read',async()=>{
  const f=mockDrive();
  await f.service.login('123.apps.googleusercontent.com');
  assert.equal(DRIVE_SCOPE,'https://www.googleapis.com/auth/drive.file');
  assert.equal(f.service.connected(),true);
  const initial=await f.service.readExpenseState();
  assert.equal(initial.exists,false);
  assert.equal(initial.ownerId,'drive-owner-1');
  const saved=await f.service.saveExpenseSnapshot(base,'');
  assert.equal(saved.exists,true);
  assert.equal(saved.data.transactions[0].amount,45000);
  assert.equal(saved.snapshotId,'snapshot-1');
  assert.equal(f.files[0].metadata.appProperties.dn_expenses,'snapshot_v1');
  assert.equal(f.files[0].metadata.appProperties.base_id,'root');
  assert.match(f.files[0].metadata.name,/^DuyNguyen-Expenses-.*\.json$/);
  const restored=await f.service.readExpenseState();
  assert.equal(restored.data.transactions[0].amount,45000);
  assert.deepEqual(restored.ancestorIds,[]);
  const second=await f.service.saveExpenseSnapshot(changed,saved.snapshotId);
  assert.equal(second.snapshotId,'snapshot-2');
  assert.equal(f.files.length,2);
  assert.equal((await f.service.readExpenseState()).data.transactions[0].amount,58000);
  assert.deepEqual((await f.service.readExpenseState()).ancestorIds,['snapshot-1']);
  assert.equal(f.files[0].content.includes('45000'),true,'earlier snapshot retained');
  await assert.rejects(()=>f.service.saveExpenseSnapshot(base,'snapshot-1'),err=>err.code==='EXPENSES_CONFLICT');
  assert.equal(f.files.length,2,'conflict must not create a new file');
  assert.equal(f.requests.some(req=>req.url.includes('upload/drive/v3/files')),true);
  assert.equal(f.requests.some(req=>req.url.includes('about?fields=')),true);
});

test('Drive planner preserves new device restore, custom budgets, manual divergence and account isolation',()=>{
  const custom=newCategory('Học tập');
  const local={...base,customCategories:[custom],budgets:{'2026-11':{total:5000000,categories:{[custom.id]:800000}}}};
  const remote={ownerId:'google-a',exists:true,snapshotId:'snap-1',data:base,updatedAt:date,ancestorIds:[]};
  const meta={ownerId:'google-a',fileId:'snap-1',fingerprint:snapshotFingerprint(base)};
  assert.equal(SYNC_INTERVAL_MS,180000);
  assert.equal(SHORT_SYNC_DELAY_MS,12000);
  assert.equal(planDriveSync({localData:emptyData(),localMissing:true,remote,meta:null}).action,'pull');
  assert.equal(planDriveSync({localData:base,remote,meta}).action,'equal');
  assert.equal(planDriveSync({localData:local,remote,meta}).action,'push');
  assert.equal(planDriveSync({localData:local,remote:{...remote,data:changed,snapshotId:'snap-2',ancestorIds:['snap-1']},meta}).action,'conflict');
  assert.equal(planDriveSync({localData:base,remote:{...remote,data:changed,snapshotId:'snap-2',ancestorIds:['snap-1']},meta}).action,'pull');
  assert.equal(planDriveSync({localData:base,remote:{...remote,data:changed,snapshotId:'fork-2',ancestorIds:[]},meta}).action,'conflict');
  assert.equal(planDriveSync({localData:local,remote:{...remote,ownerId:'google-b'},meta}).action,'conflict');
  assert.equal(planDriveSync({localData:local,remote:{ownerId:'google-a',exists:false,snapshotId:'',data:null},meta:null}).action,'push');
  assert.equal(planDriveSync({localData:local,remote,meta:null}).action,'conflict');
});

test('Drive sync metadata is distinct from old Cloudflare D1 metadata',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)||null,setItem:(key,val)=>values.set(key,val)};
  values.set('dn-daily-expenses-cloud-sync-v1',JSON.stringify({ownerId:'old',revision:15}));
  assert.equal(readDriveSyncMeta(storage),null);
  writeDriveSyncMeta(storage,{ownerId:'google-a',snapshotId:'snapshot-1',updatedAt:date},snapshotFingerprint(base));
  assert.equal(readDriveSyncMeta(storage).ownerId,'google-a');
  assert.equal(readDriveSyncMeta(storage).fileId,'snapshot-1');
  assert.equal(values.has(DRIVE_SYNC_KEY),true);
  assert.equal(values.has('dn-daily-expenses-cloud-sync-v1'),true);
});

test('Expenses links GIS on its standalone page, uses Drive and never calls D1 from its UI',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const page=read('../src/expenses/Expenses.jsx');
  const html=read('../expenses/index.html');
  const hook=read('../src/expenses/useExpenseDriveSync.js');
  assert.match(html,/accounts\.google\.com\/gsi\/client/);
  assert.match(page,/Kết nối Google Drive/);
  assert.match(page,/Đồng bộ ngay/);
  assert.match(page,/đồng bộ mỗi 3 phút/);
  assert.match(hook,/discoverExpenseDriveClientId/);
  assert.match(hook,/environmentValue:import\.meta\.env\.VITE_GOOGLE_CLIENT_ID/);
  assert.match(hook,/setInterval\(\(\)=>\{/);
  assert.match(hook,/SYNC_INTERVAL_MS/);
  assert.match(hook,/SHORT_SYNC_DELAY_MS/);
  assert.match(hook,/planDriveSync/);
  assert.doesNotMatch(page,/useExpenseCloudSync|Cloudflare D1|Hướng dẫn cấu hình D1/);
  assert.doesNotMatch(hook,/\/api\/expenses-state|\/api\/status/);
});

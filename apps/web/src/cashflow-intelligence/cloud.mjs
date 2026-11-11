import {createDriveService,DRIVE_SCOPE} from '../services/googleDriveService.js';
export const SHEET='15t-VRxlkP8_GiQ5NbqqrZIkttUV53es0AeN6XlPhyko';
export const TAG='dn_cashflow',KIND='duynguyen-cashflow-snapshot-v1';
const API='https://www.googleapis.com/drive/v3/files';
export function validateSnapshot(x){
 if(x?.kind!==KIND||!Number.isSafeInteger(x.revision)||x.revision<1||!Array.isArray(x.transactions)||x.transactions.length>10000||typeof x.account!=='string'||x.transactions.some(t=>!/^[-0-9a-f]{36}$/i.test(t.id)||!['OK','REVIEW','REJECTED','DUPLICATE','ERROR'].includes(t.status)||!Array.isArray(t.duplicate_ids)||t.amount_minor!=null&&(!Number.isSafeInteger(t.amount_minor)||t.amount_minor<0)||!['income','expense','transfer','unknown'].includes(t.direction)||t.currency!=='VND')||new Set(x.transactions.map(t=>t.id)).size!==x.transactions.length)throw Error('Backup Cashflow không hợp lệ');
 return x;
}
export function createCashflowCloud(options={}){
 const drive=createDriveService({...options,scope:DRIVE_SCOPE+' https://www.googleapis.com/auth/spreadsheets'});
 const json=async(url,opts)=>(await drive.cashflowRequest(url,opts)).json();
 async function list(){
  let cursor='',files=[];
  do{const q=new URLSearchParams({q:"trashed=false and appProperties has {key='dn_cashflow' and value='snapshot_v1'}",fields:'nextPageToken,files(id,name,appProperties,webViewLink,createdTime)',orderBy:'createdTime desc',pageSize:'100'});if(cursor)q.set('pageToken',cursor);const r=await json(API+'?'+q);files.push(...(r.files||[]).filter(f=>f.appProperties?.[TAG]==='snapshot_v1'));cursor=r.nextPageToken||'';if(files.length>10000)throw Error('Quá nhiều backup Cashflow')}while(cursor);
  const children=new Set(files.map(f=>f.appProperties?.base_id).filter(Boolean));
  const heads=files.filter(f=>!children.has(f.id));
  if(heads.length>1)throw Error('Xung đột: Drive có nhiều nhánh Cashflow. Giữ nguyên mọi backup; cần đối chiếu trước khi đồng bộ.');
  return {files,head:heads[0]||null};
 }
 async function read(file){return validateSnapshot(await json(API+'/'+encodeURIComponent(file.id)+'?alt=media'))}
 async function save(snapshot,expectedId=''){
  validateSnapshot(snapshot);
  const before=await list();if((before.head?.id||'')!==expectedId)throw Error('Drive đã thay đổi từ thiết bị khác. Kết nối lại để đối chiếu.');
  if(before.head){const old=await read(before.head);if(old.account!==snapshot.account)throw Error('Backup thuộc tài khoản khác. Không ghi đè.');if(old.revision>snapshot.revision)throw Error('Backup Drive mới hơn D1. Giữ nguyên để khôi phục.');if(JSON.stringify(old)===JSON.stringify(snapshot))return before.head;}
  const boundary='cashflow_'+crypto.randomUUID(),metadata={name:'DuyNguyen-Cashflow-'+snapshot.revision+'-'+Date.now()+'.json',mimeType:'application/json',appProperties:{[TAG]:'snapshot_v1',base_id:expectedId||'root',ledger_revision:String(snapshot.revision)}};
  const content=JSON.stringify(snapshot);if(new Blob([content]).size>4*1024*1024)throw Error('Backup vượt 4 MB. Xuất JSON để lưu riêng.');
  const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',content,'\r\n--'+boundary+'--\r\n']);
  const file=await json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,appProperties',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
  if(!file.id||JSON.stringify(await read(file))!==content)throw Error('Drive đọc lại không khớp. Chưa xác nhận đồng bộ.');
  const after=await list();if(after.head?.id!==file.id)throw Error('Drive có thay đổi đồng thời. Backup đã được giữ, cần đối chiếu.');
  return file;
 }
 // Append an audit ledger in the existing spreadsheet. Original invoice rows and
 // formulas remain intact; blog totals use the authoritative D1 tombstones.
 async function syncSheet(snapshot){
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+SHEET;
  let metadata=await json(base+'?fields=sheets.properties');
  if(!metadata.sheets?.some(s=>s.properties.title==='Cashflow_Curation')){
   try{await json(base+':batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{addSheet:{properties:{title:'Cashflow_Curation'}}}]})})}catch(e){metadata=await json(base+'?fields=sheets.properties');if(!metadata.sheets?.some(s=>s.properties.title==='Cashflow_Curation'))throw e}
  }
  const range=encodeURIComponent("'Cashflow_Curation'!A1:H20000"),old=await json(base+'/values/'+range);
  const values=old.values||[],ids=new Set(values.slice(1).map(r=>r[0]));
  if(values.length>=20000)throw Error('Nhật ký Sheets đã đạt 20.000 dòng. Drive vẫn giữ backup; cần mở rộng nhật ký trước khi tiếp tục.');
  const rows=[];if(!values.length)rows.push(['event_id','transaction_id','revision','deleted_at','duplicate_ids','duplicate_reason','original_status','synced_at']);
  for(const t of snapshot.transactions){const id=snapshot.revision+':'+t.id;if(ids.has(id))continue;rows.push([id,t.id,snapshot.revision,t.deleted_at||'',t.duplicate_ids.join(','),t.duplicate_reason,t.status,new Date().toISOString()]);}
  if(rows.length)await json(base+'/values/'+encodeURIComponent("'Cashflow_Curation'!A:H")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:rows})});
  const check=await json(base+'/values/'+range),seen=new Set((check.values||[]).map(r=>r[0]));
  if(snapshot.transactions.some(t=>!seen.has(snapshot.revision+':'+t.id)))throw Error('Sheets chưa đọc lại đủ thay đổi. Hãy đồng bộ lại.');
 }
 return {...drive,list,read,save,syncSheet};
}

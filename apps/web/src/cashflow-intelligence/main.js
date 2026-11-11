import {discoverExpenseDriveClientId,EDITOR_DRIVE_CLIENT_KEY} from '../expenses/driveClientResolver.js';
import {createCashflowCloud} from './cloud.mjs';
const $=x=>document.getElementById(x),endpoint=x=>'/cashflow-intelligence/api/'+x;
const cloud=createCashflowCloud();
let ledger=null,email='',clientId='',headId='',busy=false,lastSync='',cloudDirty=true,operationId=crypto.randomUUID();
const pending=new Set();
const money=n=>Number(n||0).toLocaleString('vi-VN')+' ₫';
const date=s=>{if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?String(s):d.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})};
async function api(k,body){const r=await fetch(endpoint(k),{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(Error(j.error||'Không tải được dữ liệu'),{status:r.status});return j}
function showLogin(){email='';cloud.disconnect();headId='';ledger=null;pending.clear();$('dashboard').hidden=true;$('login').hidden=false}
function showDashboard(value){email=value;$('login').hidden=true;$('dashboard').hidden=false;$('who').textContent='Đăng nhập bằng Google: '+email}
function render(){
 if(!ledger)return;
 let income=0,expense=0;for(const x of ledger.months){if(x.direction==='income')income+=x.amount;if(x.direction==='expense')expense+=x.amount}
 $('income').textContent=money(income);$('expense').textContent=money(expense);$('net').textContent=money(income-expense);$('net').className='big '+(income-expense<0?'negative':'positive');
 $('states').textContent=ledger.counts.map(x=>x.status+': '+x.count).join(' · ')+(ledger.duplicateCount?' · '+ledger.duplicateCount+' dòng cần kiểm tra trùng':'');
 $('insights').textContent=ledger.categories.map(x=>x.category+': '+money(x.total)+' ('+x.transactions+' giao dịch)').join(' · ')||'Chưa có dữ liệu xác nhận.';
 const tbody=$('rows');tbody.replaceChildren();
 for(const x of ledger.transactions){
  if(x.deleted_at&&!$('showDeleted').checked)continue;
  const row=document.createElement('tr');row.className=x.deleted_at?'deleted':pending.has(x.id)?'pending':x.duplicate_ids.length?'duplicate':'';
  let ocr={};try{ocr=JSON.parse(x.raw_redacted_json||'{}')}catch{}
  const detail=ocr.receipt||{};
  const ocrText=[...(detail.warnings||[]),detail.total!=null?'Thực trả: '+money(detail.total):'',detail.subtotal!=null?'Tạm tính: '+money(detail.subtotal):'',detail.discount!=null?'Giảm: '+money(detail.discount):'',ocr.pipeline==='ocr-ai-v2'?'OCR + AI đã đối chiếu':''].filter(Boolean).join(' · ');
  for(const value of [date(x.occurred_at),x.direction==='expense'?'Chi':x.direction==='income'?'Thu':x.direction==='transfer'?'Chuyển nội bộ':'—',x.amount_minor==null?'Chờ OCR':money(x.amount_minor),x.bank,x.description,(x.deleted_at?'Đã xóa · ':pending.has(x.id)?'Chờ xóa · ':'')+x.status,x.duplicate_ids.length?x.duplicate_reason+' · '+x.duplicate_ids.map(id=>id.slice(0,8)).join(', '):'—',ocrText||'—']){const td=document.createElement('td');td.textContent=String(value??'—');row.append(td)}
  const action=document.createElement('td');if(!x.deleted_at){const button=document.createElement('button');button.className='alt';button.textContent=pending.has(x.id)?'Hoàn tác':'Xóa';button.disabled=busy;button.setAttribute('aria-label',(pending.has(x.id)?'Hoàn tác xóa ':'Xóa giao dịch ')+x.id.slice(0,8));button.onclick=()=>{pending.has(x.id)?pending.delete(x.id):pending.add(x.id);render()};action.append(button);if(x.status==='REVIEW'&&x.evidence_r2_key){const retry=document.createElement('button');retry.className='alt';retry.textContent='Đọc lại OCR + AI';retry.disabled=busy||pending.size>0;retry.onclick=()=>reprocess(x);action.append(retry)}}row.append(action);tbody.append(row);
 }
 $('pendingStatus').textContent=pending.size?pending.size+' giao dịch đang chờ xóa. Thống kê sẽ đổi sau khi lưu.':'Chưa có thay đổi chờ lưu.';
 $('saveChanges').disabled=busy||!pending.size;$('undoChanges').disabled=busy||!pending.size;
}
async function load(){
 const data=await api('ledger');
 if(pending.size&&ledger&&data.revision!==ledger.revision){$('dataError').textContent='Có dữ liệu mới. Hoàn tác lựa chọn rồi làm mới để đối chiếu; chưa ghi đè lựa chọn.';return}
 cloudDirty=cloudDirty||ledger?.revision!==data.revision;ledger=data;render();
}
const error=e=>{if(e.status===401)showLogin();$('dataError').textContent=e.message};
async function reprocess(tx){
 if(busy||pending.size)return;busy=true;render();$('dataError').textContent='Đang OCR + AI, đối chiếu tổng tiền và ngày…';
 try{await api('reprocess',{id:tx.id,updated_at:tx.updated_at});await load();cloudDirty=true;$('dataError').textContent='Đã đọc lại. Giao dịch vẫn chờ xác nhận; kiểm tra cột OCR / đối chiếu.'}catch(e){error(e)}finally{busy=false;render()}
}
function exportData(data=ledger){const link=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));link.href=url;link.download='cashflow-backup-'+Date.now()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function sync(){
 if(busy)return;
 if(pending.size)throw Error('Lưu hoặc hoàn tác lựa chọn xóa trước khi đồng bộ.');
 if(!cloud.connected())throw Error('Kết nối Google Drive / Sheets để đồng bộ.');
 busy=true;render();$('cloudStatus').textContent='Đang đồng bộ…';
 try{
  const account=await (await cloud.cashflowRequest('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)')).json();
  if(account.user?.emailAddress?.toLowerCase()!==email.toLowerCase())throw Error('Tài khoản Drive khác tài khoản Cashflow. Hãy kết nối cùng tài khoản.');
  const snapshot=await api('snapshot');
  const state=await cloud.list();if((state.head?.id||'')!==headId)throw Error('Drive có bản mới từ thiết bị khác. Bấm Đối chiếu / khôi phục Drive.');
  const previous=state.head?await cloud.read(state.head):null;
  if(previous&&previous.account!==email)throw Error('Backup khác tài khoản. Không ghi đè.');
  let file=state.head;
  if(!previous||previous.revision!==snapshot.revision||JSON.stringify(previous.transactions)!==JSON.stringify(snapshot.transactions))file=await cloud.save(snapshot,headId);
  headId=file.id;$('backupLink').href=file.webViewLink||'https://drive.google.com/file/d/'+encodeURIComponent(file.id)+'/view';$('backupLink').hidden=false;
  await cloud.syncSheet(snapshot);
  await load();cloudDirty=ledger.revision!==snapshot.revision;lastSync=new Date().toISOString();
  $('cloudStatus').textContent=(cloudDirty?'Có dữ liệu mới chờ đồng bộ. ':'Đã đồng bộ Drive và Sheets. ')+'Lần thành công: '+date(lastSync);
 }catch(e){$('cloudStatus').textContent='Chưa đồng bộ xong: '+e.message;throw e}finally{busy=false;render()}
}
$('saveChanges').onclick=async()=>{
 if(busy||!ledger||!pending.size)return;
 busy=true;render();$('dataError').textContent='';
 try{await api('save',{revision:ledger.revision,deleteIds:[...pending],operationId});pending.clear();operationId=crypto.randomUUID();cloudDirty=true;await load();$('cloudStatus').textContent='Đã lưu trên Cloudflare. Chờ đồng bộ Google Drive / Sheets.'}catch(e){error(e)}finally{busy=false;render()}
 if(cloud.connected()&&!pending.size)sync().catch(error);
};
$('undoChanges').onclick=()=>{pending.clear();operationId=crypto.randomUUID();render()};
$('showDeleted').onchange=render;
$('refresh').onclick=()=>load().catch(error);
$('exportJson').onclick=()=>exportData();
$('syncCloud').onclick=()=>sync().catch(error);
$('connectDrive').onclick=()=>{
 if(!clientId){error(Error('Cấu hình Google chưa tải xong. Hãy thử lại.'));return}
 cloud.login(clientId).then(async()=>{const state=await cloud.list();headId=state.head?.id||'';if(state.head){const backup=await cloud.read(state.head);if(backup.account!==email)throw Error('Backup thuộc tài khoản khác');if(backup.revision>ledger.revision)throw Error('Drive có bản mới hơn. Bấm Đối chiếu / khôi phục Drive.')}return sync()}).catch(e=>{$('cloudStatus').textContent=e.message;error(e)});
};
$('restoreCloud').onclick=async()=>{
 try{
  if(busy||pending.size)throw Error('Lưu hoặc hoàn tác lựa chọn trước khi khôi phục.');
  if(!cloud.connected())throw Error('Kết nối Google Drive / Sheets trước.');
  const state=await cloud.list();if(!state.head)throw Error('Chưa có backup Cashflow trên Drive.');
  const backup=await cloud.read(state.head);if(backup.account!==email)throw Error('Backup khác tài khoản.');
  await load();const ids=backup.transactions.filter(t=>t.deleted_at&&ledger.transactions.some(x=>x.id===t.id&&!x.deleted_at)).map(t=>t.id);
  if(!ids.length){headId=state.head.id;$('cloudStatus').textContent='Đã đối chiếu: dấu xóa trên Drive đã có trong cloud. Toàn bộ giao dịch được tải lại từ Cloudflare trên thiết bị này.';return}
  exportData(ledger);if(!confirm('Đã xuất JSON dự phòng. Khôi phục '+ids.length+' dấu xóa từ Drive? Không thay thế các giao dịch khác.'))return;
  await api('save',{revision:ledger.revision,deleteIds:ids,operationId:crypto.randomUUID()});headId=state.head.id;cloudDirty=true;await load();await sync();
 }catch(e){error(e)}
};
$('logout').onclick=async()=>{if(pending.size&&!confirm('Các lựa chọn xóa chưa lưu sẽ mất. Đăng xuất?'))return;try{await api('logout',{})}finally{showLogin()}};
window.addEventListener('beforeunload',e=>{if(pending.size){e.preventDefault();e.returnValue=''}});
setInterval(()=>{if(email&&navigator.onLine&&!document.hidden&&!busy&&!pending.size){if(cloud.connected())sync().catch(error);else load().catch(error)}},180000);
function returnTo(){const next=new URLSearchParams(location.search).get('return_to');if(next&&next.startsWith('/')&&!next.startsWith('//')&&!next.startsWith('/auth/')){location.assign(next);return true}return false}
async function boot(){
 try{const me=await api('me');showDashboard(me.email);if(returnTo())return;await load()}catch(e){if(e.status===401)showLogin();else error(e)}
 const stored=localStorage.getItem(EDITOR_DRIVE_CLIENT_KEY)||'';
 const cfg=await discoverExpenseDriveClientId({environmentValue:import.meta.env.VITE_GOOGLE_CLIENT_ID||'',storedValue:stored});
 clientId=cfg.clientId||(await api('config')).clientId;
 const tag=document.createElement('script');tag.src='https://accounts.google.com/gsi/client';tag.async=true;
 tag.onload=()=>{google.accounts.id.initialize({client_id:clientId,callback:async({credential})=>{try{const me=await api('session',{credential});showDashboard(me.email);if(!returnTo())await load()}catch(e){$('loginError').textContent=e.message}}});google.accounts.id.renderButton($('google'),{type:'standard',theme:'outline',size:'large',text:'signin_with',shape:'pill'})};tag.onerror=()=>{$('loginError').textContent='Không tải được Google Sign-In.'};document.head.append(tag);
}
boot().catch(e=>{$('loginError').textContent=e.message});

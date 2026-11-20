import {parseMccValues,filterMcc,distinct} from './model.mjs';
import './style.css';
const app=document.getElementById('app');
const base=(import.meta.env.BASE_URL||'/').replace(/\/$/,'');
const api=base+'/api/mcc-cashback',fallback=base+'/mcc-cashback/snapshot.json';
let all=[],mode='loading',updated='',message='';
const state={query:'',bank:'',network:'',category:'',current:false};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n};
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&[
  'hsbc.com.vn','www.hsbc.com.vn','vib.com.vn','www.vib.com.vn','vpbank.com.vn','www.vpbank.com.vn',
  'acb.com.vn','www.acb.com.vn'].includes(u.hostname)?u.href:''}catch{return ''}}
function pct(r){return r.rate||'—'}
function cell(text,tag='td'){return el(tag,'',text)}
function stats(){return {records:all.length,mcc:distinct(all,'mcc').length,banks:distinct(all,'bank').length,cards:distinct(all,'card').length}}
app.innerHTML='<div class="mc-shell"><nav class="mc-top"><div class="mc-mark">DUY NGUYEN <span style="color:#2972d0">/ MCC CASHBACK</span></div><div class="mc-links"><a href="/">Editor</a><a href="https://oneblog.tamsudev-com.workers.dev/tools/" rel="noopener">OneBlog TOOLs</a><a href="https://docs.google.com/spreadsheets/d/18HueEhTZMv8VErQcQrRR60q1RXjbspAtyysB9PjJTAo/edit" target="_blank" rel="noopener">Google Sheets ↗</a></div></nav><section class="mc-heading"><div><div class="mc-label">CASHBACK INTELLIGENCE · VIETNAM</div><h1>MCC Cashback Database.</h1><p>Tra cứu mức hoàn tiền theo MCC, ngân hàng và mạng thẻ. Mỗi kết quả đi kèm điều kiện, trần hoàn và nguồn chính thức.</p></div><button id="refresh" class="mc-action" type="button">↻ Làm mới dữ liệu</button></section><div id="notice" class="mc-alert">Các mức cashback phụ thuộc điều kiện và thời hạn hiệu lực. Không coi mức “lên đến” là tỷ lệ mặc định cho mọi giao dịch.</div><div id="kpis" class="mc-kpis"></div><section class="mc-panel"><div class="mc-filters"><div class="mc-field search"><label for="search">Mã MCC / ngành hàng / tên thẻ</label><input id="search" type="search" placeholder="Ví dụ: 5411, siêu thị, Live+, giáo dục"></div><div class="mc-field"><label for="bank">Ngân hàng</label><select id="bank"></select></div><div class="mc-field"><label for="network">Mạng thẻ</label><select id="network"></select></div><div class="mc-field"><label for="category">Danh mục</label><select id="category"></select></div><label class="mc-checkbox"><input id="current" type="checkbox"> Ẩn ưu đãi đã hết hạn</label></div><div class="mc-status"><span id="mode">Đang kết nối dữ liệu…</span><div><strong id="count"></strong> <button id="export" class="mc-action secondary" type="button">Xuất CSV</button></div></div><div class="mc-table-wrap"><table><thead><tr><th>MCC / Ngành</th><th>Ngân hàng & thẻ</th><th>Mạng</th><th>Cashback</th><th>Điều kiện & trần</th><th>Kiểm duyệt</th><th>Nguồn</th></tr></thead><tbody id="records"></tbody></table></div></section><footer class="mc-footer"><span>Google Sheets là dữ liệu gốc; crawl phát hiện thay đổi nhưng không tự công bố tỷ lệ chưa xác minh.</span><span id="stamp"></span></footer></div>';
function options(id,values,label){const x=document.getElementById(id);const keep=x.value;x.replaceChildren(new Option(label,''),...values.map(v=>new Option(v,v)));x.value=values.includes(keep)?keep:''}
function render(){
 const s=stats();document.getElementById('kpis').replaceChildren(
  ...[[s.records,'Bản ghi ưu đãi'],[s.mcc,'Mã MCC'],[s.banks,'Ngân hàng'],[s.cards,'Sản phẩm thẻ']].map(([number,label])=>{
   const b=el('div','mc-kpi');b.append(el('strong','',number),el('span','',label));return b}));
 options('bank',distinct(all,'bank'),'Tất cả ngân hàng');options('network',distinct(all,'network'),'Visa / Mastercard');
 options('category',distinct(all,'spendGroup'),'Tất cả danh mục');draw();
}
function draw(){
 const rows=filterMcc(all,state),tbody=document.getElementById('records');
 document.getElementById('count').textContent=rows.length+' kết quả';
 document.getElementById('mode').innerHTML='<strong class="'+(mode==='live'?'mc-live':'mc-offline')+'">'+
 (mode==='live'?'● Google Sheets trực tiếp':'● Bản dữ liệu dự phòng')+'</strong> · '+(updated?new Date(updated).toLocaleString('vi-VN'):'')+
 (message?' · '+message.replace(/[<>]/g,''):'');
 document.getElementById('stamp').textContent='Cập nhật lần cuối: '+(updated?new Date(updated).toLocaleString('vi-VN'):'chưa rõ');
 const fragment=document.createDocumentFragment();
 for(const r of rows.slice(0,1500)){
  const tr=el('tr');
  const a=el('td');a.append(el('strong','',r.mcc),el('span','mc-note',r.category));tr.append(a);
  const b=el('td');b.append(el('strong','',r.bank+' · '+r.card),el('span','mc-note',r.spendGroup));tr.append(b);
  tr.append(cell(r.network));
  const c=el('td');c.append(el('span','mc-rate'+(r.rate==='0%'?' zero':''),pct(r)));c.append(el('span','mc-note',r.rewardType));tr.append(c);
  const d=el('td');d.append(el('span','',r.conditions||'Không công bố'));d.append(el('span','mc-note','Trần: '+(r.cap||'Xem thể lệ')));tr.append(d);
  const e=el('td');e.append(el('span','mc-tag '+(/EXPIRED|REVIEW/.test(r.reviewStatus)?'warn':''),r.reviewStatus==='EXPIRED_REVIEW'?'Cần xem lại hạn':r.reviewStatus==='VERIFIED'?'Đã xác minh':'Chờ tái xác minh'));e.append(el('span','mc-note',r.validity));tr.append(e);
  const f=el('td');const u=safeLink(r.sourceUrl);if(u){const link=el('a','mc-source','Nguồn ngân hàng ↗');link.href=u;link.target='_blank';link.rel='noopener noreferrer';f.append(link)}else f.textContent='—';f.append(el('span','mc-note',r.checkedAt));tr.append(f);
  fragment.append(tr);
 }
 if(!rows.length){const t=el('tr');const c=el('td','mc-empty','Không tìm thấy MCC phù hợp.');c.colSpan=7;t.append(c);fragment.append(t)}
 tbody.replaceChildren(fragment);
}
async function load(){
 const btn=document.getElementById('refresh');btn.disabled=true;btn.textContent='Đang đồng bộ…';
 try{const r=await fetch(api,{cache:'no-store'});if(!r.ok)throw Error('Google Sheets HTTP '+r.status);const d=await r.json();if(!Array.isArray(d.records))throw Error('Backend trả dữ liệu lỗi');all=d.records;mode='live';updated=d.updatedAt;message='';}
 catch(e){mode='snapshot';message='Chưa kết nối live: '+e.message;
  try{const d=await (await fetch(fallback,{cache:'no-store'})).json();all=parseMccValues([d.headers,...d.rows]);updated=d.generatedAt;}
  catch(err){all=[];updated='';message='Không tải được dữ liệu: '+err.message}
 }finally{btn.disabled=false;btn.textContent='↻ Làm mới dữ liệu';render()}
}
for(const id of ['search','bank','network','category','current']){
 document.getElementById(id).addEventListener(id==='search'?'input':'change',event=>{
  state[id==='search'?'query':id]=id==='current'?event.target.checked:event.target.value;draw();
 });
}
document.getElementById('refresh').addEventListener('click',load);
document.getElementById('export').addEventListener('click',()=>{
 const filtered=filterMcc(all,state),keys=['mcc','category','bank','card','network','rate','conditions','cap','validity','rewardType','sourceUrl','checkedAt','reviewStatus'];
 const csv=[keys.join(','),...filtered.map(r=>keys.map(k=>'"'+String(r[k]||'').replace(/"/g,'""')+'"').join(','))].join('\r\n');
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='mcc-cashback-'+new Date().toISOString().slice(0,10)+'.csv';a.click();URL.revokeObjectURL(url);
});
load();setInterval(()=>{if(!document.hidden&&navigator.onLine)load()},180000);

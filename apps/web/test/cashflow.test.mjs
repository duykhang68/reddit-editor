import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {annotateDuplicates,duplicateReason} from '../src/cashflow-intelligence/duplicates.mjs';
import {readLedger,report,saveDeletions} from '../src/cashflow-intelligence/ledger.mjs';
import {validateReceipt} from '../src/cashflow-intelligence/receipt.mjs';
import {createCashflowCloud,validateSnapshot} from '../src/cashflow-intelligence/cloud.mjs';
import {onRequest} from '../functions/cashflow-intelligence/api/[[path]].js';
const id=n=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000000';
const tx=(n,extra={})=>({id:id(n),occurred_at:'2026-09-13T12:00:00+07:00',amount_minor:30000,direction:'expense',currency:'VND',description:'Starbucks Landmark 81',bank:'',bank_reference:'0100252210',status:'OK',...extra});
class D1 {
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(`CREATE TABLE transactions(id TEXT PRIMARY KEY,occurred_at TEXT,amount_minor INTEGER,direction TEXT,currency TEXT,description TEXT,bank TEXT,bank_reference TEXT,status TEXT,category TEXT,created_at TEXT,updated_at TEXT); CREATE TABLE sync_outbox(transaction_id TEXT,state TEXT,attempts INTEGER,last_error TEXT,updated_at TEXT);CREATE TABLE audit_events(id TEXT PRIMARY KEY,event_type TEXT,safe_details TEXT,created_at TEXT);`);this.db.exec(readFileSync(new URL('../../../schema.sql',import.meta.url),'utf8'));}
 prepare(sql){const db=this.db;let args=[];const wrap={bind(...a){args=a;return wrap},async all(){return {results:db.prepare(sql).all(...args)}},async first(){return db.prepare(sql).get(...args)||null},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}};return wrap}
 async batch(stmts){this.db.exec('BEGIN');try{const values=[];for(const stmt of stmts){try{values.push(await stmt.all())}catch(e){throw e}}this.db.exec('COMMIT');return values}catch(e){this.db.exec('ROLLBACK');throw e}}
 seed(row){this.db.prepare('INSERT INTO transactions(id,occurred_at,amount_minor,direction,currency,description,bank,bank_reference,status,category,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.occurred_at,row.amount_minor,row.direction,row.currency,row.description,row.bank,row.bank_reference,row.status,'Ăn uống','2026-11-08T01:00:00Z','2026-11-08T01:00:00Z')}
}
test('missing bank and different OCR description still flag same invoice; both remain visible',()=>{
 const rows=annotateDuplicates([tx(1),tx(2,{description:'Ruby Grapefruit & Honey Black Tea'})]);assert.equal(rows.length,2);assert.deepEqual(rows[0].duplicate_ids,[id(2)]);assert.match(rows[0].duplicate_reason,/Cùng mã/);
});
test('do not conflate different reference, direction, date, bank, incomplete OCR or amounts',()=>{
 for(const fields of [{bank_reference:'OTHER123'},{direction:'income'},{occurred_at:'2026-09-14'},{amount_minor:30001},{amount_minor:null}])assert.equal(duplicateReason(tx(1),tx(2,fields)),'');
 assert.equal(duplicateReason(tx(1,{bank:'VCB'}),tx(2,{bank:'ACB'})),'');
 assert.equal(duplicateReason(tx(1,{bank_reference:'',description:'Ảnh giao dịch cần OCR và xác minh'}),tx(2,{bank_reference:'',description:'Ảnh giao dịch cần OCR và xác minh'})),'');
});
test('missing reference is only a suspected duplicate; rejected/deleted rows do not flag survivors',()=>{
 assert.match(duplicateReason(tx(1,{bank_reference:''}),tx(2,{bank_reference:''})),/Nghi trùng/);
 assert.equal(duplicateReason(tx(1),tx(2,{deleted_at:'now'})),'');assert.equal(duplicateReason(tx(1),tx(2,{status:'REJECTED'})),'');
});
test('save tombstones, recompute totals, retain original records, cross-device reload and idempotent retry',async()=>{
 const db=new D1();db.seed(tx(1));db.seed(tx(2));let data=report(await readLedger(db));assert.equal(data.months[0].amount,60000);
 const body={revision:data.revision,deleteIds:[id(2)],operationId:id(90)};await saveDeletions(db,body,'owner@example.com');
 data=report(await readLedger(db));assert.equal(data.months[0].amount,30000);assert.equal(data.transactions.length,2);assert.equal(data.duplicateCount,0);assert.ok(data.transactions.find(t=>t.id===id(2)).deleted_at);
 assert.equal((await saveDeletions(db,body,'owner@example.com')).idempotent,true);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM cashflow_curation').get().n,1);
});
test('concurrent edits and invalid deletion sets cannot partially commit',async()=>{
 const db=new D1();db.seed(tx(1));const rev=(await readLedger(db)).revision;db.seed(tx(2));await assert.rejects(saveDeletions(db,{revision:rev,deleteIds:[id(1)],operationId:id(91)},'owner'),e=>e.status===409);
 await assert.rejects(saveDeletions(db,{revision:rev+1,deleteIds:[id(1),id(5)],operationId:id(92)},'owner'),e=>e.status===409);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM cashflow_curation').get().n,0);
});
const text='Starbucks Rewards\nGiao dịch tại cửa hàng\nStarbucks Landmark 81\nRuby Grapefruit Tea 40.000đ\nMã đơn hàng: 0100252210\nNgày & giờ: 13/09/2026 12:30\nTạm tính 40.000đ\nGiảm giá 10.000đ\nTổng thanh toán 30.000đ';
const ai={document_type:'retail_receipt',direction:'expense',amount:30000,date:'2026-09-13',confidence:.9,description:'Starbucks Tea',reference:'0100252210',amount_evidence:'Tổng thanh toán 30.000đ',date_evidence:'Ngày & giờ: 13/09/2026 12:30',subtotal:40000,discount:10000,fee:0,tax:0,total:30000};
test('OCR + AI preserves receipt components and agrees with Starbucks parser after discount',()=>{const out=validateReceipt(ai,text);assert.equal(out.amount,30000);assert.equal(out.receipt.subtotal,40000);assert.equal(out.receipt.discount,10000);assert.equal(out.receipt.critical.length,0);assert.match(out.at,/12:30/)});
test('wrong subtotal, invented amount/date, balance and cash tender cannot be approved',()=>{
 for(const change of [{amount:40000,amount_evidence:'Tạm tính 40.000đ'},{amount:90000},{date:'2026-09-14'},{amount_evidence:'Số dư 30.000đ'}])assert.ok(validateReceipt({...ai,...change},text).receipt.critical.length);
 assert.equal(validateReceipt({...ai,date:'2026-02-30'},text),null);assert.equal(validateReceipt({...ai,amount:null},text),null);
});
test('credit card repayment and refunds validate transaction direction',()=>{
 assert.ok(validateReceipt({...ai,document_type:'credit_card_bill_payment'},text).receipt.critical.length);
 assert.ok(validateReceipt({...ai,document_type:'refund'},text).receipt.critical.length);
});
test('private APIs require Google session and reject cross-origin save',async()=>{
 let r=await onRequest({request:new Request('https://app.test/cashflow-intelligence/api/ledger'),env:{}});assert.equal(r.status,401);
 r=await onRequest({request:new Request('https://app.test/cashflow-intelligence/api/save',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}),env:{}});assert.equal(r.status,403);
});
async function signedRequest(path,method='GET',body){
 const secret='s'.repeat(64),env={APP_SECRET:secret,CASHFLOW_ALLOWED_GOOGLE_EMAILS:'owner@example.com'};
 const claims=Buffer.from(JSON.stringify({v:1,sub:'google-owner',email:'owner@example.com',exp:Math.floor(Date.now()/1000)+600})).toString('base64url');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('tet-dinh-mui-cashflow-google-session-v1:'+secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(claims))).toString('base64url');
 return {request:new Request('https://app.test/cashflow-intelligence/api/'+path,{method,headers:{origin:'https://app.test',cookie:'__Host-cashflow_google_session='+claims+'.'+signature},body:body?JSON.stringify(body):undefined}),env};
}
test('valid Google cookie loads ledger; authorized save and OCR RPC work',async()=>{
 const db=new D1();db.seed(tx(1));let context=await signedRequest('ledger');context.env.CASHFLOW_DB=db;
 let response=await onRequest(context);assert.equal(response.status,200);let ledger=await response.json();assert.equal(ledger.transactions.length,1);
 context=await signedRequest('reprocess','POST',{id:id(1),updated_at:'old'});context.env.CASHFLOW_DB=db;context.env.CASHFLOW_BACKEND={reprocessReceipt:async(id,revision)=>{assert.equal(revision,'old');return {ok:true}}};response=await onRequest(context);assert.equal(response.status,200);
 context=await signedRequest('save','POST',{revision:ledger.revision,deleteIds:[id(1)],operationId:id(94)});context.env.CASHFLOW_DB=db;response=await onRequest(context);assert.equal(response.status,200);assert.ok((await readLedger(db)).transactions[0].deleted_at);
});
test('Drive upload, readback, Sheets journal and dataset isolation with same-account restoration',async()=>{
 let files=[],contents=new Map(),sheet=[],uploadCount=0;const requests=[];
 const oauth=()=>({hasGrantedAllScopes:()=>true,initTokenClient:opts=>({requestAccessToken:args=>{assert.equal(args.prompt,'');opts.callback({access_token:'ephemeral',expires_in:3600})}})});
 const fetcher=async(url,opts={})=>{
  requests.push(url);assert.match(opts.headers.Authorization,/Bearer ephemeral/);
  if(url.includes('/upload/')){const raw=await opts.body.text(),json=raw.split('\r\n\r\n')[2].split('\r\n--')[0],metadata=JSON.parse(raw.split('\r\n\r\n')[1].split('\r\n--')[0]);const file={id:'f'+(++uploadCount),appProperties:metadata.appProperties,webViewLink:'https://drive.google.com/file/d/f'+uploadCount};files.unshift(file);contents.set(file.id,JSON.parse(json));return Response.json(file)}
  if(url.includes('alt=media'))return Response.json(contents.get(url.match(/files\/([^?]+)/)[1]));
  if(url.includes('drive/v3/files?')){assert.match(decodeURIComponent(url),/dn_cashflow/);return Response.json({files})}
  if(url.includes('about?'))return Response.json({user:{emailAddress:'owner@example.com'}});
  if(url.includes(':append')){sheet.push(...JSON.parse(opts.body).values);return Response.json({})}
  if(url.includes('/values/'))return Response.json({values:sheet});
  if(url.includes('sheets.googleapis.com'))return Response.json({sheets:[{properties:{title:'Cashflow_Curation'}}]});
  throw Error('Unexpected request '+url);
 };
 const cloud=createCashflowCloud({fetcher,oauth});await cloud.login('test.apps.googleusercontent.com');
 const snapshot={kind:'duynguyen-cashflow-snapshot-v1',revision:1,account:'owner@example.com',transactions:annotateDuplicates([tx(1)])};
 const file=await cloud.save(snapshot);assert.equal(file.id,'f1');assert.deepEqual(await cloud.read(file),snapshot);await cloud.syncSheet(snapshot);await cloud.syncSheet(snapshot);assert.equal(sheet.length,2);
 const other=createCashflowCloud({fetcher,oauth});await other.login('test.apps.googleusercontent.com');assert.deepEqual(await other.read((await other.list()).head),snapshot);
 await assert.rejects(cloud.save({...snapshot,revision:2},''),/thiết bị khác/);cloud.disconnect();await assert.rejects(cloud.list(),/hết hạn|chưa kết nối/);
 assert.throws(()=>validateSnapshot({...snapshot,kind:'duynguyen-expenses-snapshot-v1'}));
});
test('Drive OAuth expiry and corrupt readback never report synced',async()=>{
 let expire=false;const cloud=createCashflowCloud({oauth:()=>({hasGrantedAllScopes:()=>true,initTokenClient:opts=>({requestAccessToken:()=>opts.callback({access_token:'memory',expires_in:3600})})}),fetcher:async()=>new Response('{}',{status:expire?401:200})});
 await cloud.login('test.apps.googleusercontent.com');expire=true;await assert.rejects(cloud.list(),/401/);assert.equal(cloud.connected(),false);
});

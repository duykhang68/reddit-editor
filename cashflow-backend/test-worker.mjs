import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import Worker from '/private/tmp/cashflow-worker-test.mjs';
import {report,readLedger,saveDeletions} from './source/apps/web/src/cashflow-intelligence/ledger.mjs';
class DB {
 constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(`CREATE TABLE telegram_inbox(update_id INTEGER PRIMARY KEY,chat_id TEXT,telegram_user_id TEXT,message_id TEXT,kind TEXT,received_at TEXT,state TEXT DEFAULT 'received',error_code TEXT);CREATE TABLE transactions(id TEXT PRIMARY KEY,identity_key TEXT UNIQUE,telegram_update_id INTEGER UNIQUE,telegram_user_id TEXT,chat_id TEXT,message_id TEXT,occurred_at TEXT,bank TEXT,direction TEXT,amount_minor INTEGER,currency TEXT,description TEXT,bank_reference TEXT,category TEXT,confidence REAL,status TEXT,source_type TEXT,evidence_r2_key TEXT,evidence_drive_file_id TEXT,raw_redacted_json TEXT,reviewed_at TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE app_config(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);CREATE TABLE sync_outbox(id TEXT PRIMARY KEY,transaction_id TEXT,destination TEXT,state TEXT DEFAULT 'pending',attempts INTEGER DEFAULT 0,last_error TEXT,external_id TEXT,created_at TEXT,updated_at TEXT,UNIQUE(transaction_id,destination));CREATE TABLE audit_events(id TEXT PRIMARY KEY,event_type TEXT,safe_details TEXT,created_at TEXT);`);this.db.exec(readFileSync(new URL('schema.sql',import.meta.url),'utf8'))}
 prepare(sql){let args=[];const db=this.db,stmt={bind(...v){args=v;return stmt},async all(){return {results:db.prepare(sql).all(...args)}},async first(){return db.prepare(sql).get(...args)||null},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}};return stmt}
 async batch(stmts){this.db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.all());this.db.exec('COMMIT');return out}catch(e){this.db.exec('ROLLBACK');throw e}}
}
const transcript='Starbucks Rewards\nGiao dịch tại cửa hàng\nStarbucks Landmark 81\nRuby Grapefruit Tea 40.000đ\nMã đơn hàng: 0100252210\nNgày & giờ: 13/09/2026 12:30\nTạm tính 40.000đ\nGiảm giá 10.000đ\nTổng thanh toán 30.000đ';
const extraction={document_type:'retail_receipt',direction:'expense',amount:30000,date:'2026-09-13',confidence:.9,description:'Starbucks Tea',reference:'0100252210',amount_evidence:'Tổng thanh toán 30.000đ',date_evidence:'Ngày & giờ: 13/09/2026 12:30',subtotal:40000,discount:10000,total:30000};
test('Telegram -> durable REVIEW -> OCR transcript -> AI -> invoice validation; replay-safe, duplicates visible, deleted cannot be approved',async()=>{
 const db=new DB(),jobs=[],messages=[],objects=new Map();let modelCalls=0;
 const env={DB:db,TELEGRAM_BOT_TOKEN:'test',TELEGRAM_WEBHOOK_SECRET:'test-secret',TELEGRAM_ALLOWED_USER_ID:'1',TELEGRAM_ALLOWED_CHAT_ID:'2',GEMINI_API_KEY:'test-gemini',EVIDENCE:{put:async(k,b,m)=>objects.set(k,{bytes:b,m}),get:async k=>{const v=objects.get(k);return v?{arrayBuffer:async()=>v.bytes,httpMetadata:v.m.httpMetadata}:null}}};
 const original=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  if(url.includes('generativelanguage')&&url.includes('models?'))return Response.json({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}]});
  if(url.includes('generateContent')){modelCalls++;const prompt=JSON.parse(options.body).contents[0].parts[0].text;return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(prompt.startsWith('Chỉ làm OCR')?{text:transcript}:extraction)}]}}]})}
  if(url.includes('/getFile'))return Response.json({ok:true,result:{file_path:'test.png',file_size:100}});
  if(url.includes('/file/bot')){const image=new Uint8Array(100);image[0]=137;image[1]=80;return new Response(image)}
  if(url.includes('/sendMessage'))messages.push(JSON.parse(options.body).text);
  return Response.json({ok:true});
 };
 const ctx={waitUntil:p=>jobs.push(p)},worker=new Worker(ctx,env);
 const send=update=>worker.fetch(new Request('https://cashflow.test/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':'test-secret'},body:JSON.stringify(update)}));
 const update=n=>({update_id:n,message:{from:{id:1},chat:{id:2},message_id:n,photo:[{file_id:'photo'}]}});
 try{
  assert.equal((await send(update(1))).status,200);await Promise.all(jobs.splice(0));
  let data=report(await readLedger(db));assert.equal(data.transactions.length,1);assert.equal(data.transactions[0].amount_minor,30000);assert.equal(data.transactions[0].status,'REVIEW');assert.equal(JSON.parse(data.transactions[0].raw_redacted_json).pipeline,'ocr-ai-v2');assert.equal(modelCalls,2);
  await send(update(1));assert.equal((await readLedger(db)).transactions.length,1);
  await send(update(2));await Promise.all(jobs.splice(0));data=report(await readLedger(db));assert.equal(data.transactions.length,2);assert.equal(data.duplicateCount,2);assert.ok(messages.some(m=>m.includes('Nghi trùng')));
  const removed=data.transactions[0];await saveDeletions(db,{revision:data.revision,deleteIds:[removed.id],operationId:crypto.randomUUID()},'owner@example.com');
  await send({update_id:3,callback_query:{id:'approve',from:{id:1},message:{chat:{id:2},message_id:1},data:'a:'+removed.id}});
  assert.equal((await readLedger(db)).transactions.find(t=>t.id===removed.id).status,'REVIEW');assert.equal(db.db.prepare('SELECT COUNT(*) n FROM sync_outbox').get().n,0);
  // Read-only RPC preview never changes the ledger or sends messages.
  const active=data.transactions.find(t=>t.id!==removed.id),before=(await readLedger(db)).revision,count=messages.length;
  const preview=await worker.previewReceipt(active.id);assert.equal(preview.extraction.amount,30000);assert.equal((await readLedger(db)).revision,before);assert.equal(messages.length,count);
 }finally{globalThis.fetch=original}
});

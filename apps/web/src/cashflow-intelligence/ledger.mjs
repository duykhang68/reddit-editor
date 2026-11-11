import {annotateDuplicates} from './duplicates.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export async function readLedger(db) {
 const [rev,rows]=await db.batch([
  db.prepare('SELECT revision FROM cashflow_revision WHERE id=1'),
  db.prepare('SELECT t.*,c.deleted_at,c.deleted_by FROM transactions t LEFT JOIN cashflow_curation c ON c.transaction_id=t.id ORDER BY t.created_at DESC,t.id')
 ]);
 return {revision:rev.results[0].revision,transactions:annotateDuplicates(rows.results||[])};
}
export function report(ledger) {
 const active=ledger.transactions.filter(t=>!t.deleted_at),valid=active.filter(t=>t.status==='OK'),months=new Map(),counts=new Map(),categories=new Map();
 for(const t of active)counts.set(t.status,(counts.get(t.status)||0)+1);
 for(const t of valid){if(t.occurred_at){const key=t.occurred_at.slice(0,7)+'|'+t.direction;const row=months.get(key)||{month:t.occurred_at.slice(0,7),direction:t.direction,amount:0,count:0};row.amount+=t.amount_minor||0;row.count++;months.set(key,row)}if(t.direction==='expense'){const key=t.category||'Khác',row=categories.get(key)||{category:key,total:0,transactions:0};row.total+=t.amount_minor||0;row.transactions++;categories.set(key,row)}}
 return {...ledger,months:[...months.values()].sort((a,b)=>b.month.localeCompare(a.month)),counts:[...counts].map(([status,count])=>({status,count})),categories:[...categories.values()].sort((a,b)=>b.total-a.total).slice(0,8),reviewCount:counts.get('REVIEW')||0,duplicateCount:active.filter(t=>t.duplicate_ids.length).length,currency:'VND'};
}
export async function saveDeletions(db,body,email) {
 if(!Number.isSafeInteger(body?.revision)||!Array.isArray(body?.deleteIds)||body.deleteIds.length<1||body.deleteIds.length>100||new Set(body.deleteIds).size!==body.deleteIds.length||body.deleteIds.some(x=>!/^[-0-9a-f]{36}$/i.test(x))||!/^[-0-9a-f]{36}$/i.test(body.operationId))throw fail(400,'Yêu cầu lưu không hợp lệ');
 const already=await db.prepare("SELECT id FROM audit_events WHERE id=? AND event_type='cashflow_delete_batch'").bind(body.operationId).first();
 if(already)return {ok:true,idempotent:true};
 const current=await readLedger(db);
 if(current.revision!==body.revision)throw fail(409,'Dữ liệu đã thay đổi. Tải lại để đối chiếu trước khi lưu.');
 if(body.deleteIds.some(id=>!current.transactions.some(t=>t.id===id&&!t.deleted_at)))throw fail(409,'Một giao dịch đã bị xóa hoặc không còn tồn tại.');
 const now=new Date().toISOString(),statements=[db.prepare('INSERT INTO cashflow_write_guards(id,valid) SELECT ?, CASE WHEN revision=? THEN 1 ELSE 0 END FROM cashflow_revision WHERE id=1').bind(body.operationId,body.revision)];
 for(const id of body.deleteIds){
  statements.push(db.prepare('INSERT INTO cashflow_curation(transaction_id,deleted_at,deleted_by,operation_id) VALUES(?,?,?,?)').bind(id,now,email,body.operationId));
  // Keep the source and its original status for audit; the tombstone is authoritative.
  statements.push(db.prepare("UPDATE sync_outbox SET state='failed',attempts=10,last_error='USER_DELETED',updated_at=? WHERE transaction_id=? AND state!='synced'").bind(now,id));
 }
 statements.push(db.prepare("INSERT INTO audit_events(id,event_type,safe_details,created_at) VALUES(?,'cashflow_delete_batch',?,?)").bind(body.operationId,JSON.stringify({ids:body.deleteIds,actor:email}),now),db.prepare('UPDATE cashflow_revision SET revision=revision+1 WHERE id=1'),db.prepare('DELETE FROM cashflow_write_guards WHERE id=?').bind(body.operationId));
 try{await db.batch(statements)}catch(e){if(/constraint|unique/i.test(String(e)))throw fail(409,'Có thay đổi đồng thời. Tải lại và kiểm tra trước khi lưu.');throw e}
 return {ok:true,deleted:body.deleteIds.length};
}

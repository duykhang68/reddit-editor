export const normalize = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]/g,'');
const usableReference = x => {const s=normalize(x);return s.length>=4&&!/^(null|none|unknown|na|khongco|0000+)$/.test(s)?s:''};
const day = x => String(x||'').slice(0,10);
export function duplicateReason(a,b) {
 if(a.id===b.id||a.deleted_at||b.deleted_at||['REJECTED','ERROR'].includes(a.status)||['REJECTED','ERROR'].includes(b.status))return '';
 if(!Number.isSafeInteger(a.amount_minor)||a.amount_minor<=0||a.amount_minor!==b.amount_minor||a.direction!==b.direction||a.direction==='unknown'||a.currency!==b.currency||!day(a.occurred_at)||day(a.occurred_at)!==day(b.occurred_at))return '';
 const ar=usableReference(a.bank_reference),br=usableReference(b.bank_reference);
 if(ar&&br&&ar!==br)return '';
 const ab=normalize(a.bank),bb=normalize(b.bank);
 if(ab&&bb&&ab!==bb)return '';
 if(ar&&ar===br)return 'Cùng mã hóa đơn/giao dịch, ngày, số tiền và chiều thu chi';
 const ad=normalize(a.description),bd=normalize(b.description);
 if(ad.length>=8&&ad===bd&&!/^(anhgiaodichcanocrvaxacminh|giaodichtuanh)$/.test(ad))return 'Nghi trùng: cùng ngày, số tiền và nội dung; cần đối chiếu chứng từ';
 return '';
}
export function annotateDuplicates(rows) {
 const result=rows.map(x=>({...x,duplicate_ids:[],duplicate_reason:''}));
 const buckets=new Map();
 for(const row of result){const key=[day(row.occurred_at),row.direction,row.currency,row.amount_minor].join('|');const list=buckets.get(key)||[];for(const other of list){const reason=duplicateReason(row,other);if(reason){row.duplicate_ids.push(other.id);other.duplicate_ids.push(row.id);row.duplicate_reason=reason;other.duplicate_reason=reason;}}list.push(row);buckets.set(key,list)}
 return result;
}

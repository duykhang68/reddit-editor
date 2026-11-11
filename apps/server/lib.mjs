import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
export const BLOGGER_BASE = 'https://www.googleapis.com/blogger/v3';
export function randomToken(bytes=32) { return randomBytes(bytes).toString('base64url'); }
export function deriveKey(secret) { return scryptSync(secret, 'duynguyen-blogger-editor-session-v1', 32); }
export function seal(value, key) {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
export function unseal(data,key) {
  const raw=Buffer.from(data,'base64'); if(raw.length<29)throw Error('Invalid session file');
  const dec=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));
  dec.setAuthTag(raw.subarray(12,28));
  return JSON.parse(Buffer.concat([dec.update(raw.subarray(28)),dec.final()]).toString('utf8'));
}
export function secureEquals(a,b){
  const x=Buffer.from(String(a||'')); const y=Buffer.from(String(b||''));
  return x.length===y.length && timingSafeEqual(x,y);
}
export function codeChallenge(verifier){return createHash('sha256').update(verifier).digest('base64url');}
export function numericId(id){
  if(!/^\d{1,30}$/.test(String(id||'')))throw Object.assign(new Error('ID không hợp lệ'),{status:400});
  return String(id);
}
export function normalizeInput(body){
  const title=String(body?.title||'').trim();
  const content=String(body?.content||'');
  if(!title || title.length>200)throw Object.assign(new Error('Tiêu đề phải có 1–200 ký tự'),{status:400});
  if(content.length>250_000)throw Object.assign(new Error('Bài viết vượt quá 250.000 ký tự HTML'),{status:400});
  if(!Array.isArray(body?.labels))throw Object.assign(new Error('labels phải là một danh sách'),{status:400});
  const labels=[...new Set(body.labels.map(x=>String(x).trim()).filter(Boolean))];
  if(labels.length>20||labels.some(x=>x.length>80))throw Object.assign(new Error('Nhãn tối đa 20 mục, mỗi nhãn 80 ký tự'),{status:400});
  return {title,content,labels};
}
export function safePost(post){
  return {id:String(post.id),title:post.title||'',content:post.content||'',labels:post.labels||[],updated:post.updated||'',published:post.published||'',status:post.status||'',url:post.url||''};
}
export function readCookies(header=''){
  return Object.fromEntries(String(header).split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
}
export function errorStatus(error){return Number.isInteger(error?.status)?error.status:500;}

/** Require a future RFC 3339 timestamp with an explicit numeric UTC offset. */
export function validatePublishDate(value,now=Date.now()) {
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(s) || !Number.isFinite(Date.parse(s)))
    throw Object.assign(new Error('Ngày giờ xuất bản phải có định dạng RFC 3339 và múi giờ rõ ràng.'),{status:400});
  const point=Date.parse(s);
  if(point<=now+120000)throw Object.assign(new Error('Lịch đăng phải cách thời gian hiện tại ít nhất 2 phút.'),{status:400});
  if(point>now+2*365*86400000)throw Object.assign(new Error('Chỉ hỗ trợ đặt lịch trong vòng 2 năm.'),{status:400});
  return s;
}

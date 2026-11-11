// Local, review-first article queue. No credentials or tokens are persisted here.
export const QUEUE_KEY='duy-wikipedia-writer-queue-v1';
export function loadQueue(storage){
 try {
  const value=JSON.parse(storage.getItem(QUEUE_KEY)||'[]');
  if(!Array.isArray(value))return [];
  return value.filter(j=>j&&typeof j.id==='string'&&typeof j.url==='string').slice(-100)
   .map(j=>({...j,status:j.status==='running'?'queued':j.status}));
 }catch{return [];}
}
export function persistQueue(storage,jobs){storage.setItem(QUEUE_KEY,JSON.stringify(jobs.slice(-100)));}
export function enqueue(jobs,url,provider){
 const normalized=new URL(url).toString();
 if(jobs.some(j=>j.url===normalized&&['queued','running'].includes(j.status)))throw Error('URL này đang nằm trong hàng đợi.');
 return [...jobs,{id:globalThis.crypto.randomUUID(),url:normalized,provider,status:'queued',createdAt:new Date().toISOString(),result:null,error:''}];
}
export function nextJob(jobs){return jobs.find(j=>j.status==='queued')||null;}
export function updateJob(jobs,id,patch){return jobs.map(j=>j.id===id?{...j,...patch}:j);}

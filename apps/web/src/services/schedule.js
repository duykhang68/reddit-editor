// Blogger is the publication source of truth. Markdown/LocalStorage are portable mirrors.
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
export const scheduleStorageKey = blogId => 'dn-editor-scheduled-v1-' + String(blogId || 'new');
export const SCHEDULE_ZONES = [...new Set([localTimeZone(), 'Asia/Ho_Chi_Minh', 'UTC', 'Asia/Seoul', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles'])];

function zonedParts(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Ngày giờ không hợp lệ.');
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    second:'2-digit',hourCycle:'h23'
  }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
  return values;
}
const pad = value => String(value).padStart(2,'0');
export function formatScheduleInZone(value, timeZone = localTimeZone()) {
  const p = zonedParts(value,timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
export function scheduleLocalToIso(value, timeZone = localTimeZone()) {
  const matched = String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!matched) throw new Error('Chọn ngày và giờ xuất bản hợp lệ.');
  const [,year,month,day,hour,minute]=matched.map(Number);
  const target=Date.UTC(year,month-1,day,hour,minute,0);
  if(!Number.isFinite(target) || new Date(target).toISOString().slice(0,16)!==value)
    throw new Error('Ngày hoặc giờ không tồn tại.');
  let utc=target;
  for(let i=0;i<5;i++){
    const p=zonedParts(utc,timeZone);
    const observed=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    const next=utc+(target-observed);
    if(next===utc)break;
    utc=next;
  }
  if(formatScheduleInZone(utc,timeZone)!==value)
    throw new Error('Giờ này không tồn tại tại múi giờ đã chọn (DST). Chọn giờ khác.');
  const offsetMinutes=Math.round((target-utc)/60000);
  const sign=offsetMinutes>=0?'+':'-';
  const abs=Math.abs(offsetMinutes);
  return `${value}:00${sign}${pad(Math.floor(abs/60))}:${pad(abs%60)}`;
}
export function scheduleIsoInZone(value, timeZone = localTimeZone()) {
  const local=formatScheduleInZone(value,timeZone);
  return scheduleLocalToIso(local,timeZone);
}
export function scheduleLabel(value, timeZone=localTimeZone()) {
  if(!value)return '';
  return new Intl.DateTimeFormat('vi-VN',{timeZone,dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' ('+timeZone+')';
}
export function scheduleFrontmatter(schedule) {
  if (!schedule?.publishDate || !Number.isFinite(Date.parse(schedule.publishDate))) return '';
  const publishDate=scheduleIsoInZone(schedule.publishDate,schedule.timeZone||localTimeZone());
  return 'date: '+publishDate+'\n'
    +'publishDate: '+publishDate+'\n'
    +'draft: false\n'
    +'scheduled: true\n';
}
export function parseScheduleFrontmatter(content) {
  const block=String(content||'').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if(!block)return null;
  const read = name => block[1].match(new RegExp('^'+name+':\\s*(.*?)\\s*$', 'm'))?.[1];
  const publishDate=read('publishDate'), scheduled=read('scheduled');
  if(scheduled!=='true'||!publishDate||!Number.isFinite(Date.parse(publishDate)))return null;
  return {publishDate,timeZone:localTimeZone()};
}
export function loadScheduleCache(blogId) {
  try {
    const data=JSON.parse(localStorage.getItem(scheduleStorageKey(blogId))||'[]');
    return Array.isArray(data)?data.filter(x=>/^\d+$/.test(String(x.id))&&x.publishDate).slice(0,100):[];
  }catch{return [];}
}
export function storeScheduleCache(blogId, list) {
  try{localStorage.setItem(scheduleStorageKey(blogId),JSON.stringify(list.slice(0,100)));}catch{/* private mode or disabled storage */}
}

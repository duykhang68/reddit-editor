export const SHEET_ID='19nL6wtouHV-0OumsQR2jF-5xWA1cpbpivRUIsm7hDgk';
export const COLUMNS=['Việt','Hàn','Anh','Context or Expression','Ngữ pháp ví dụ','Category'];
export const DRIVE_NAME='DuyNguyen-Wikipedia-AI-Writer-v1.json';
export const normalize=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
export function parseWikiUrl(raw){
  const url=new URL(String(raw).trim());
  if(url.protocol!=='https:'||!/^[a-z-]+\.wikipedia\.org$/i.test(url.hostname)||!url.pathname.startsWith('/wiki/'))throw Error('Chỉ hỗ trợ link bài viết https://<ngôn ngữ>.wikipedia.org/wiki/...');
  const title=decodeURIComponent(url.pathname.slice(6)).replace(/_/g,' ');
  if(!title||title.includes('/'))throw Error('URL Wikipedia không hợp lệ.');
  return {lang:url.hostname.split('.')[0],title,canonical:url.origin+'/wiki/'+encodeURIComponent(title.replace(/ /g,'_'))};
}
export function normalizeVocabulary(input){
  if(!Array.isArray(input))throw Error('AI không trả về mảng từ vựng.');
  return input.slice(0,80).map(item=>({
    vi:String(item.vi||'').trim(),ko:String(item.ko||'').trim(),en:String(item.en||'').trim(),
    context:String(item.context||'').trim(),grammar:String(item.grammar||'').trim(),category:String(item.category||'General / Everyday Language').trim()
  })).filter(v=>v.vi&&v.ko&&v.en);
}
export function uniqueVocabulary(rows,existing){
  const seen=new Set((existing||[]).flatMap(row=>[row?.[0],row?.[1],row?.[2]].map(normalize).filter(Boolean)));
  return rows.filter(row=>{
    const keys=[row.vi,row.ko,row.en].map(normalize);
    if(keys.some(k=>seen.has(k)))return false;
    keys.forEach(k=>seen.add(k));return true;
  });
}
export const toSheetRow=v=>[v.vi,v.ko,v.en,v.context,v.grammar,v.category];
export function parseAIJson(text){
 const cleaned=String(text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\`\`\`$/,'').trim();
 const start=cleaned.indexOf('{'),end=cleaned.lastIndexOf('}');
 if(start<0||end<start)throw Error('AI không xuất JSON hợp lệ.');
 const data=JSON.parse(cleaned.slice(start,end+1));
 if(typeof data.title!=='string'||typeof data.article!=='string'||!data.article.trim())throw Error('AI thiếu nội dung bài viết.');
 return {title:data.title.trim(),article:data.article.trim(),vocabulary:normalizeVocabulary(data.vocabulary)};
}
export function validateBackup(data){
 if(!data||data.schema!=='wikipedia-writer-v1'||typeof data.source!=='string'||typeof data.article!=='string'||!Array.isArray(data.vocabulary))throw Error('Bản sao lưu Drive không hợp lệ.');
 return {source:data.source,title:String(data.title||''),article:data.article,vocabulary:normalizeVocabulary(data.vocabulary),savedAt:String(data.savedAt||'')};
}
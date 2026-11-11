import React,{useEffect,useRef,useState} from 'react';
import {SHEET_ID,parseAIJson,normalizeVocabulary,uniqueVocabulary,toSheetRow} from '../wikipedia-writer/model.js';
import {discoverExpenseDriveClientId,validClientId,EDITOR_DRIVE_CLIENT_KEY} from '../expenses/driveClientResolver.js';
import {readRememberedAiKeys,persistAiKeys} from '../wikipedia-writer/aiKeyStorage.js';
import {generateGemini,generateGroq} from '../wikipedia-writer/aiModelDiscovery.js';
import {loadQueue,persistQueue,enqueue,nextJob,updateJob} from './queue.js';
const SCOPE='https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.appdata';
const SHEETS='https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values/';
const DRIVE='https://www.googleapis.com/drive/v3/files';
const escapeName=encodeURIComponent("'Sheet1'!A2:F");
const DRIVE_NAME='DuyNguyen-YouTube-Subtitle-Writer-v1.json';
const DRIVE_PREFIX='DuyNguyen-YouTube-Subtitle-Writer-';
const backupFilename=(title,date=new Date())=>DRIVE_PREFIX+date.toISOString().replace(/[:.]/g,'-')+'-'+(String(title||'ban-thao').replace(/[\\/<>:"|?*\u0000-\u001f]/g,' ').trim().replace(/\s+/g,' ').slice(0,65)||'ban-thao')+'.json';
const backupLabel=file=>file.name===DRIVE_NAME?'Bản sao lưu cũ':file.name.replace(DRIVE_PREFIX,'').replace(/\.json$/,'');
const PROMPT=(source,text)=>`You are a senior Vietnamese journalist and language educator. Write an ORIGINAL, careful Vietnamese article based ONLY on the provided YouTube subtitle transcript; not a verbatim transcription. Return ONLY a JSON object with keys "title","article","vocabulary" (12-25 entries, each vi,ko,en,context,grammar,category). Vietnamese sentence-case titles and headings. Clear lead, 3-5 sections, conclusion. Attribute speakers' opinions, do not invent facts, dates, numbers, quotations or external verification. Remove repetition and advertising. Mention limitations of fragmentary subtitles. Do not reproduce lengthy verbatim subtitle passages. Vocabulary must occur in your generated article, grammar includes short VI:, KR:, EN: examples. Source: user-provided subtitles (unverified). Transcript:\n${text.slice(0,16000)}`;
function subtitleSource(value){
 const raw=String(value||'').trim();
 if(raw.length<80)throw Error('Hãy dán ít nhất 80 ký tự phụ đề YouTube.');
 if(raw.length>50000)throw Error('Phụ đề vượt 50.000 ký tự. Hãy chia thành nhiều phần.');
 const text=raw.replace(/^WEBVTT[^\n]*\n?/i,'').split(/\r?\n/).filter(line=>!/^\s*(?:\d+|\d\d:\d\d(?::\d\d)?[.,]\d+\s*-->.*|NOTE.*)$/i.test(line.trim())).join('\n').trim();
 if(text.length<60)throw Error('Phụ đề không đủ nội dung sau khi bỏ timestamp.');
 return {text,canonical:raw,title:'Phụ đề YouTube'};
}
function validateBackup(data){
 if(!data||data.schema!=='youtube-subtitle-writer-v1'||typeof data.source!=='string'||typeof data.article!=='string'||!Array.isArray(data.vocabulary))throw Error('Bản sao lưu phụ đề không hợp lệ.');
 return {source:data.source,title:String(data.title||''),article:data.article,vocabulary:normalizeVocabulary(data.vocabulary),savedAt:String(data.savedAt||'')};
}
async function responseJSON(response){
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(body.error?.message||body.error||'HTTP '+response.status);
 return body;
}
async function subtitleExtract(value){return subtitleSource(value);}
const snapshot=(source,title,article,vocabulary)=>({schema:'youtube-subtitle-writer-v1',source,title,article,vocabulary,savedAt:new Date().toISOString()});
const WRITING_STAGES=[
 {id:'source',label:'Đọc nội dung YouTube Subtitle',detail:'Đang kiểm tra phụ đề đã dán'},
 {id:'model',label:'Xác định model AI',detail:'Kiểm tra quyền sử dụng Gemini / Groq'},
 {id:'generate',label:'Viết bài và tạo từ vựng',detail:'Chờ AI hoàn thành bài báo và dữ liệu ba ngôn ngữ'},
 {id:'validate',label:'Kiểm tra và hiển thị kết quả',detail:'Xác thực nội dung, đưa vào bản thảo'}
];
export default function Writer(){
 const [savedAiKeys]=useState(()=>{try{return readRememberedAiKeys(window.localStorage);}catch{return {remember:false,gemini:'',groq:''};}});
 const [rememberAiKeys,setRememberAiKeys]=useState(savedAiKeys.remember);
 const [url,setUrl]=useState(''),[provider,setProvider]=useState('auto'),[gKey,setGKey]=useState(savedAiKeys.gemini),[qKey,setQKey]=useState(savedAiKeys.groq);
 const [keyStorageError,setKeyStorageError]=useState('');
 function updateRememberAiKeys(checked){
  setRememberAiKeys(checked);
  let saved=false;try{saved=persistAiKeys(window.localStorage,checked,gKey,qKey);}catch{}
  if(!saved){
   setKeyStorageError('Trình duyệt không cho phép lưu trên thiết bị này.');
   setRememberAiKeys(false);
  }else setKeyStorageError('');
 }
 function clearSavedAiKeys(){
  try{persistAiKeys(window.localStorage,false,'','');}catch{}
  setRememberAiKeys(false);setGKey('');setQKey('');setKeyStorageError('');
 }
 useEffect(()=>{
  if(!rememberAiKeys)return;
  let saved=false;try{saved=persistAiKeys(window.localStorage,true,gKey,qKey);}catch{}
  if(!saved)setKeyStorageError('Không thể cập nhật khóa đã lưu trên thiết bị.');
 },[rememberAiKeys,gKey,qKey]);
 const [jobs,setJobs]=useState(()=>loadQueue(window.localStorage));
 const queueRunning=useRef(false);
 const latestKeys=useRef(null);
 latestKeys.current={gKey,qKey};
 useEffect(()=>{try{persistQueue(window.localStorage,jobs);}catch{setError('Không lưu được hàng đợi trên thiết bị này.');}},[jobs]);
 function addToQueue(){
  try{
   const parsed=subtitleSource(url);
   if(provider==='gemini'&&!gKey.trim()||provider==='groq'&&!qKey.trim()||provider==='auto'&&!gKey.trim()&&!qKey.trim())throw Error('Vui lòng cấu hình ít nhất một API key trước khi xếp hàng.');
   setJobs(enqueue(jobs,parsed.canonical,provider));
   setUrl('');
   setNotice('Đã thêm bài vào hàng đợi. Bài tiếp theo tự chạy khi trang này còn mở.');
   setError('');
  }catch(e){setError(e.message);}
 }
 function removeQueued(id){setJobs(old=>old.filter(j=>j.id!==id||j.status==='running'));}
 function openQueueResult(job){
  if(!job.result)return;
  if(dirty&&!confirm('Thay bản thảo đang chỉnh sửa bằng kết quả bài này?'))return;
  setUrl(job.url);setTitle(job.result.title);setArticle(job.result.article);setRows(job.result.vocabulary);
  setSheetWriteSucceeded(false);setDirty(true);
  setNotice('Đã mở kết quả hàng đợi để kiểm tra và biên tập. Chỉ ghi Sheets khi bạn chủ động xác nhận.');
 }
 const [title,setTitle]=useState(''),[article,setArticle]=useState(''),[rows,setRows]=useState([]);
 const [busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [sheetWriteSucceeded,setSheetWriteSucceeded]=useState(false);
 const [writingProgress,setWritingProgress]=useState({state:'idle',completed:0,stage:'',detail:'Chưa bắt đầu tạo bài',model:''});
 const [access,setAccess]=useState(''),[driveFile,setDriveFile]=useState(null),[lastSync,setLastSync]=useState(''),[dirty,setDirty]=useState(false);
 const [driveBackups,setDriveBackups]=useState([]),[selectedBackup,setSelectedBackup]=useState(''),[backupListed,setBackupListed]=useState(false);
 const [oauthConfig,setOauthConfig]=useState({clientId:'',loading:true,error:'',source:''});
 useEffect(()=>{
  let active=true;
  let saved='';
  try{saved=localStorage.getItem(EDITOR_DRIVE_CLIENT_KEY)||'';}catch{}
  discoverExpenseDriveClientId({environmentValue:import.meta.env.VITE_GOOGLE_CLIENT_ID,storedValue:saved})
   .then(result=>{if(active)setOauthConfig({...result,loading:false});})
   .catch(()=>{if(active)setOauthConfig({clientId:'',loading:false,error:'Không đọc được cấu hình OAuth chung của Editor.',source:'missing'});});
  return()=>{active=false;};
 },[]);
 const stateRef=useRef({});stateRef.current={url,title,article,rows,driveFile,access,dirty};
 function change(fn){return value=>{fn(value);setDirty(true);};}
 async function auth(){
  if(oauthConfig.loading)throw Error('Đang đọc cấu hình Google OAuth từ Editor, hãy thử lại.');
  if(!validClientId(oauthConfig.clientId))throw Error(oauthConfig.error||'Không tìm thấy Google OAuth Web Client ID đã cấu hình trong Editor.');
  if(!globalThis.google?.accounts?.oauth2)throw Error('Google Identity Services chưa tải.');
  const token=await new Promise((resolve,reject)=>{
   const client=google.accounts.oauth2.initTokenClient({client_id:oauthConfig.clientId,scope:SCOPE,
    callback:result=>result.error?reject(Error(result.error)):resolve(result.access_token),
    error_callback:e=>reject(Error(e.type||'Không thể đăng nhập Google'))});
   // Reuse previously granted Google scopes when possible; do not force consent every visit.
   client.requestAccessToken({prompt:''});
  });
  setAccess(token);return token;
 }
 async function googleRequest(target,token,options={}){
  const r=await fetch(target,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});
  if(r.status===401){setAccess('');throw Error('Google hết phiên đăng nhập, vui lòng kết nối lại.');}
  return responseJSON(r);
 }
 async function listBackups(token=stateRef.current.access){
  if(!token)throw Error('Kết nối Google trước khi xem lịch sử Drive.');
  // appDataFolder is private to this app; list all matching snapshots, including the original legacy file.
  const found=[];let page='';
  do{
   const qs=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and (name = '"+DRIVE_NAME+"' or name contains '"+DRIVE_PREFIX+"')",fields:'nextPageToken,files(id,name,createdTime,modifiedTime,size)',pageSize:'1000'});
   if(page)qs.set('pageToken',page);
   const data=await googleRequest(DRIVE+'?'+qs.toString(),token);
   found.push(...(data.files||[]).filter(f=>f.name===DRIVE_NAME||(f.name.startsWith(DRIVE_PREFIX)&&f.name.endsWith('.json'))));
   page=data.nextPageToken||'';
  }while(page);
  found.sort((a,b)=>String(b.createdTime||b.modifiedTime||'').localeCompare(String(a.createdTime||a.modifiedTime||'')));
  setDriveBackups(found);setBackupListed(true);
  setSelectedBackup(old=>found.some(f=>f.id===old)?old:found[0]?.id||'');
  return found;
 }
 async function backup(token=stateRef.current.access){
  if(!token)throw Error('Kết nối Google trước khi đồng bộ Drive.');
  const current=stateRef.current;
  const value=JSON.stringify(snapshot(current.url,current.title,current.article,current.rows));
  // Never overwrite a previous session. Each manual sync is an independent, recoverable version.
  const metadata={name:backupFilename(current.title),mimeType:'application/json',parents:['appDataFolder']};
  const boundary='youtubewriter'+Date.now();
  const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+value+'\r\n--'+boundary+'--';
  const result=await googleRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime',token,{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
  setDriveFile(result);setLastSync(new Date().toLocaleString('vi-VN'));setDirty(false);
  setDriveBackups(old=>[result,...old.filter(f=>f.id!==result.id)]);
  setSelectedBackup(result.id);
  setNotice('Đã lưu một phiên riêng lên Google Drive. Các bản sao lưu trước vẫn được giữ nguyên.');
 }
 async function restore(token=stateRef.current.access){
  if(!selectedBackup)throw Error('Hãy tải danh sách và chọn một phiên trong dropdown trước khi khôi phục.');
  const file=driveBackups.find(f=>f.id===selectedBackup);
  if(!file)throw Error('Phiên đã chọn không còn trong danh sách. Hãy tải lại danh sách Drive.');
  if(stateRef.current.dirty&&!confirm('Bản thảo hiện tại có thay đổi chưa lưu. Bạn muốn thay nội dung đang làm việc bằng phiên đã chọn?'))return;
  const body=await googleRequest(DRIVE+'/'+encodeURIComponent(file.id)+'?alt=media',token);
  const restored=validateBackup(body);
  setUrl(restored.source);setTitle(restored.title);setArticle(restored.article);setRows(restored.vocabulary);
  setSheetWriteSucceeded(false);setDriveFile(file);setDirty(false);
  setWritingProgress({state:'idle',completed:0,stage:'',detail:'Đã mở phiên đã chọn từ Google Drive',model:''});
  setNotice('Đã khôi phục: '+(restored.title||backupLabel(file))+'. Các phiên khác vẫn được giữ nguyên.');
 }
 async function refreshBackups(){setBusy('listDrive');setError('');setNotice('');try{const files=await listBackups();setNotice(files.length?'Đã tìm thấy '+files.length+' phiên trên Google Drive. Hãy chọn một phiên để khôi phục.':'Chưa tìm thấy bản sao lưu nào trên Drive.');}catch(e){setError(e.message);}finally{setBusy('');}}
 async function connect(){setBusy('google');setError('');try{await auth();setDriveBackups([]);setSelectedBackup('');setBackupListed(false);setNotice('Đã kết nối Google Sheets và Drive. Nhấn “Xem các phiên đã lưu” để chủ động tải danh sách, không tự khôi phục.');}catch(e){setError(e.message);}finally{setBusy('');}}
 async function restoreManually(){setBusy('restore');setError('');setNotice('');try{await restore();}catch(e){setError(e.message);}finally{setBusy('');}}
 async function generate(){
  setBusy('ai');setError('');setNotice('');
  setWritingProgress({state:'running',completed:0,stage:'source',detail:'Đang đọc bài YouTube Subtitle…',model:''});
  try{
   const wiki=await subtitleExtract(url);
   setWritingProgress({state:'running',completed:1,stage:'model',detail:'Đã chuẩn hóa phụ đề',model:''});
   const prompt=PROMPT(wiki.canonical,wiki.text);
   const attempts=provider==='gemini'?[['Gemini',gKey,generateGemini]]:provider==='groq'?[['Groq',qKey,generateGroq]]:[['Gemini',gKey,generateGemini],['Groq',qKey,generateGroq]];
   let generated,failures=[],usedModel='';
   for(const [name,key,run] of attempts){
    if(!key.trim()){failures.push(name+': chưa nhập API key');continue;}
    try{
     const result=await run(key.trim(),prompt,undefined,event=>{
      if(event.type==='discovery')setWritingProgress({state:'running',completed:1,stage:'model',detail:'Đang kiểm tra model của '+event.provider+'…',model:''});
      if(event.type==='generation')setWritingProgress({state:'running',completed:2,stage:'generate',detail:'Đang tạo bài và trích xuất từ vựng bằng '+event.provider+'…',model:event.model});
      if(event.type==='retry')setWritingProgress({state:'running',completed:1,stage:'model',detail:'Model '+event.model+' không hoàn thành; đang thử model tiếp theo…',model:''});
     });
     setWritingProgress({state:'running',completed:3,stage:'validate',detail:'Đang kiểm tra cấu trúc bài và từ vựng…',model:result.model});
     generated=parseAIJson(result.text);
     usedModel=name+' / '+result.model;
     setNotice('Đã tạo bài bằng '+usedModel+'. Hãy đọc lại và xác minh thông tin trước khi đồng bộ.');
     break;
    }catch(e){
     failures.push(name+': '+e.message);
     setWritingProgress({state:'running',completed:1,stage:'model',detail:name+' không hoàn thành; đang kiểm tra phương án dự phòng…',model:''});
    }
   }
   if(!generated)throw Error(failures.join(' | '));
   setTitle(generated.title);setArticle(generated.article);setRows(generated.vocabulary);setSheetWriteSucceeded(false);setDirty(true);
   setWritingProgress({state:'done',completed:4,stage:'done',detail:'Đã tạo bài và '+generated.vocabulary.length+' mục từ vựng; sẵn sàng biên tập.',model:usedModel});
  }catch(e){
   setWritingProgress(old=>({...old,state:'error',detail:'Không hoàn thành: '+String(e.message||e).slice(0,180)}));
   setError(e.message);
  }finally{setBusy('');}
 }
 async function push(){
  setBusy('sheet');setError('');setNotice('');
  try{
   if(!access)throw Error('Kết nối Google để ghi Google Sheet.');
   if(!rows.length)throw Error('Chưa có từ vựng để đồng bộ.');
   const current=await googleRequest(SHEETS+escapeName+'?majorDimension=ROWS',access);
   const fresh=uniqueVocabulary(normalizeVocabulary(rows),current.values||[]);
   if(!fresh.length){setNotice('Không có từ mới: tất cả đã tồn tại trong Sheet.');return;}
   if(!confirm('Thêm '+fresh.length+' từ mới vào cuối Sheet1 (A:F)? Các dòng hiện có sẽ không bị ghi đè.'))return;
   const dest=encodeURIComponent("'Sheet1'!A:F");
   const result=await googleRequest(SHEETS+dest+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',access,{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({majorDimension:'ROWS',values:fresh.map(toSheetRow)})
   });
   setSheetWriteSucceeded(true);
   // A successful append completes the article session. Preserve Section 4 until the user resets it.
   setUrl('');
   setTitle('');
   setArticle('');
   setWritingProgress({state:'idle',completed:0,stage:'',detail:'Sẵn sàng cho bài YouTube Subtitle mới',model:''});
   setDirty(true);
   setNotice('Đã thêm '+(result.updates?.updatedRows||fresh.length)+' dòng vào Google Sheet. '+(rows.length-fresh.length)+' dòng trùng được bỏ qua. Đã làm trống bản thảo để bắt đầu bài YouTube Subtitle mới. Bạn có thể nhấn “Phiên từ vựng mới” để làm trống Section 4.');
  }catch(e){setError(e.message);}finally{setBusy('');}
 }
 function resetVocabularySession(){
  // Allow starting a fresh session even before a successful Google Sheets upload.
  if(busy||!(title.trim()||article.trim()||rows.length))return;
  if(!confirm('Bắt đầu phiên mới? Tiêu đề, bản thảo, nội dung phụ đề YouTube và từ vựng đang hiển thị sẽ bị xóa khỏi Editor, kể cả nội dung chưa ghi lên Google Sheets. Các dòng đã lưu trên Google Sheets không bị xóa.'))return;
  setUrl('');
  setTitle('');
  setArticle('');
  setRows([]);
  setSheetWriteSucceeded(false);
  setWritingProgress({state:'idle',completed:0,stage:'',detail:'Sẵn sàng cho bài YouTube Subtitle mới',model:''});
  setDirty(true);
  setError('');
  setNotice('Đã làm trống bản thảo và từ vựng. Google Sheet không thay đổi.');
 }
 async function save(){setBusy('drive');setError('');try{await backup();}catch(e){setError(e.message);}finally{setBusy('');}}
  // One worker per open page. Persist completed results independently of the editable draft.
 useEffect(()=>{
  if(busy||queueRunning.current)return;
  const job=nextJob(jobs);
  if(!job)return;
  const keys=latestKeys.current;
  const candidates=job.provider==='gemini'?[['Gemini',keys.gKey,generateGemini]]:
   job.provider==='groq'?[['Groq',keys.qKey,generateGroq]]:
   [['Gemini',keys.gKey,generateGemini],['Groq',keys.qKey,generateGroq]];
  if(!candidates.some(([,key])=>key?.trim()))return;
  queueRunning.current=true;
  setBusy('queue');
  setJobs(old=>updateJob(old,job.id,{status:'running',startedAt:new Date().toISOString()}));
  (async()=>{
   try{
    const wiki=await subtitleExtract(job.url);
    const prompt=PROMPT(wiki.canonical,wiki.text);
    let output=null,model='',failures=[];
    for(const [name,key,run] of candidates){
     if(!key?.trim()){failures.push(name+': thiếu API key');continue;}
     try{
      const result=await run(key.trim(),prompt);
      output=parseAIJson(result.text);
      model=name+' / '+result.model;break;
     }catch(e){failures.push(name+': '+e.message);}
    }
    if(!output)throw Error(failures.join(' | '));
    setJobs(old=>updateJob(old,job.id,{status:'done',result:output,model,finishedAt:new Date().toISOString()}));
   }catch(e){
    setJobs(old=>updateJob(old,job.id,{status:'failed',error:String(e.message||e).slice(0,300),finishedAt:new Date().toISOString()}));
   }finally{queueRunning.current=false;setBusy('');}
  })();
 },[jobs,busy,gKey,qKey]);
 const running=!!busy;
 return <div className="ww">
  <header className="ww-header"><a href="/" className="ww-brand">◉ DUY NGUYEN <span> / AI WRITER</span></a><span className="ww-chip">YOUTUBE SUBTITLES → ARTICLE → VI · KR · EN</span></header>
  <main className="ww-main">
   <div className="ww-heading"><span className="ww-eyebrow">AI EDITORIAL WORKSPACE</span><h1>Biến kiến thức thành <em>bài báo.</em></h1><p>Dán phụ đề YouTube, tạo bài viết mới bằng Gemini hoặc Groq, rồi đưa bộ từ vựng 3 ngôn ngữ vào Google Sheets.</p></div>
   <div className="ww-layout"><div className="ww-stack">
    <section className="ww-card"><div className="ww-card-head"><span className="ww-step">01</span><div><h2>Nguồn bài viết</h2><p>Phụ đề · văn bản / SRT / VTT</p></div></div>
     <label>Dán phụ đề YouTube<textarea rows="9" maxLength={50000} placeholder="Dán nội dung phụ đề, SRT hoặc VTT..." value={url} onChange={e=>change(setUrl)(e.target.value)}/><span className="ww-note">{url.length.toLocaleString("vi-VN")} / 50.000 ký tự</span></label>
     <div className="ww-grid"><label>Chọn AI<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="auto">Gemini → Groq dự phòng</option><option value="gemini">Chỉ Gemini</option><option value="groq">Chỉ Groq</option></select></label></div>
     <div className="ww-grid"><label>Gemini API key<input type="password" autoComplete="off" value={gKey} onChange={e=>setGKey(e.target.value)} placeholder="AIza..."/></label><label>Groq API key<input type="password" autoComplete="off" value={qKey} onChange={e=>setQKey(e.target.value)} placeholder="gsk_..."/></label></div>
     <div className="ww-key-preference"><label><input type="checkbox" checked={rememberAiKeys} onChange={e=>updateRememberAiKeys(e.target.checked)}/> Lưu API keys trên thiết bị này</label><button type="button" onClick={clearSavedAiKeys}>Xóa khóa đã lưu</button></div>
     <p className="ww-note">Mặc định chỉ lưu khóa trong phiên trang hiện tại. Nếu tích chọn, Gemini và Groq API keys sẽ được giữ trong localStorage của trình duyệt này (không mã hóa), tự điền khi mở lại trên cùng thiết bị và không đồng bộ lên Drive, Sheet hoặc máy chủ. Chỉ bật trên thiết bị cá nhân đáng tin cậy; người có quyền truy cập trình duyệt hoặc tiện ích mở rộng có thể đọc khóa đã lưu.</p>
     {keyStorageError&&<p className="ww-note" role="alert">{keyStorageError}</p>}
     <div className="ww-queue-actions"><button disabled={running||!url.trim()} className="ww-primary" onClick={generate}>{busy==='ai'?'Đang đọc và viết…':'✦ Đọc & tạo bài viết'}</button><button disabled={!url.trim()} onClick={addToQueue}>＋ Xếp hàng thực thi</button></div>
     <p className="ww-note">Hàng đợi chạy tuần tự trong khi trang còn mở; kết quả từng bài được lưu trên trình duyệt này để bạn duyệt trước khi ghi Google Sheets.</p>
    </section>
    <section className="ww-card ww-queue"><div className="ww-card-head"><span className="ww-step">☷</span><div><h2>Hàng đợi thực thi <span className="ww-count">{jobs.filter(j=>j.status==='queued'||j.status==='running').length}</span></h2><p>FIFO · Từng bài một · Chọn kết quả để duyệt</p></div></div>
     {!jobs.length&&<p className="ww-empty">Chưa có bài nào trong hàng đợi.</p>}
     <ol className="ww-queue-list">{jobs.map(job=><li key={job.id}><div className="ww-queue-meta"><strong>{job.url.slice(0,90).replace(/\s+/g,' ')+(job.url.length>90?'…':'')}</strong><small>{job.status==='running'?'● Đang xử lý':job.status==='queued'?'◷ Đang chờ':job.status==='done'?'✓ Hoàn thành':'! Thất bại'} · {job.model||job.provider}</small>{job.error&&<small role="alert">{job.error}</small>}</div><div className="ww-queue-controls">{job.status==='done'&&<button type="button" onClick={()=>openQueueResult(job)}>Mở kết quả</button>}{job.status==='failed'&&<button type="button" onClick={()=>setJobs(old=>updateJob(old,job.id,{status:'queued',error:''}))}>Thử lại</button>}{job.status!=='running'&&<button type="button" onClick={()=>removeQueued(job.id)} aria-label="Xóa bài khỏi hàng đợi">×</button>}</div></li>)}</ol>
    </section>
    <section className="ww-card"><div className="ww-card-head"><span className="ww-step">02</span><div><h2>Bản thảo bài báo</h2><p>Nội dung có thể chỉnh sửa trước khi sử dụng</p></div></div>
     <label>Tiêu đề<input value={title} onChange={e=>change(setTitle)(e.target.value)} placeholder="Bài viết sẽ xuất hiện ở đây"/></label>
     <label>Nội dung bài báo<textarea rows="15" value={article} onChange={e=>change(setArticle)(e.target.value)} placeholder="Bản thảo AI tạo sẽ được hiển thị tại đây..."/></label>
     <div className="ww-actions"><button disabled={!article} onClick={()=>navigator.clipboard.writeText(title+'\n\n'+article)}>Sao chép bài viết</button><span className="ww-note">Nguồn phụ đề do bạn dán, chưa xác minh độc lập</span></div>
    </section>
   </div><div className="ww-stack">
    <section className="ww-card ww-connect"><div className="ww-card-head"><span className="ww-step">☁</span><div><h2>Google Sheets & Drive</h2><p>{access?'Đã kết nối tài khoản Google':'Kết nối OAuth để ghi dữ liệu trực tiếp'}</p></div></div>
     <div className="ww-actions"><button disabled={running||oauthConfig.loading} onClick={connect}>{oauthConfig.loading?'Đang đọc cấu hình Google…':access?'↻ Kết nối lại':'Kết nối Google'}</button><button disabled={running||!access} onClick={refreshBackups}>↻ Xem các phiên đã lưu</button><button disabled={running||!access} onClick={save}>☁ Lưu phiên mới lên Drive</button></div>
     <label>Chọn phiên muốn khôi phục<select value={selectedBackup} disabled={running||!access||!driveBackups.length} onChange={e=>setSelectedBackup(e.target.value)}><option value="">{backupListed?'Chưa có bản sao lưu':'Bấm Xem các phiên đã lưu trước'}</option>{driveBackups.map(file=><option key={file.id} value={file.id}>{(file.createdTime||file.modifiedTime)?new Date(file.createdTime||file.modifiedTime).toLocaleString('vi-VN')+' · ':''}{backupLabel(file)}</option>)}</select></label>
     <div className="ww-actions"><button disabled={running||!access||!selectedBackup} onClick={restoreManually}>↓ Khôi phục phiên đã chọn</button><span className="ww-note">{backupListed?driveBackups.length+' phiên trên Drive':'Chưa tải danh sách phiên'}</span></div>
     {!oauthConfig.loading&&!validClientId(oauthConfig.clientId)&&<p className="ww-note" role="status">{oauthConfig.error||'Chưa tìm thấy OAuth Client ID dùng chung của Editor.'}</p>}
     <p className="ww-note">Kết nối Google không tự khôi phục. Bấm “Xem các phiên đã lưu”, chọn đúng phiên rồi bấm “Khôi phục phiên đã chọn”. Mỗi lần bấm lưu sẽ tạo một bản riêng, không ghi đè các phiên cũ. Các file sao lưu trước đây vẫn được liệt kê nếu còn tồn tại trên Drive.</p>
     <p className="ww-status">{dirty?'● Có thay đổi chưa đồng bộ':'✓ Bản thảo chưa có thay đổi mới'}{lastSync?' · Lần lưu: '+lastSync:''}</p>
     <a href={'https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/edit?gid=0'} target="_blank" rel="noopener noreferrer">Mở Google Sheet viethananh ↗</a>
    </section>
    <section className="ww-card ww-progress" aria-labelledby="ww-progress-title">
     <div className="ww-card-head"><span className="ww-step">03</span><div><h2 id="ww-progress-title">Thanh tiến độ</h2><p>Theo dõi quá trình tạo bài và trích xuất từ vựng</p></div></div>
     <div className="ww-progress-overview" role="status" aria-live="polite">
      <strong>{writingProgress.state==='done'?'Hoàn thành':writingProgress.state==='error'?'Có lỗi':writingProgress.state==='running'?'Đang xử lý':'Sẵn sàng'}</strong>
      <span>{writingProgress.completed}/4 bước đã hoàn thành</span>
     </div>
     <div className={'ww-progress-track '+(writingProgress.state==='running'?'ww-progress-active':'')} role="progressbar" aria-label="Tiến độ tạo bài" aria-valuemin={0} aria-valuemax={4} aria-valuenow={writingProgress.completed} aria-valuetext={writingProgress.completed+' trên 4 bước hoàn thành'}>
      <span className="ww-progress-fill" style={{width:(writingProgress.completed/4*100)+'%'}}/>
     </div>
     <ol className="ww-progress-steps">{WRITING_STAGES.map((step,i)=>{
      const completed=i<writingProgress.completed;
      const active=writingProgress.state==='running'&&writingProgress.stage===step.id;
      const failed=writingProgress.state==='error'&&writingProgress.stage===step.id;
      return <li key={step.id} className={'ww-progress-step '+(completed?'is-done':active?'is-active':failed?'is-error':'is-waiting')}>
       <span className="ww-progress-marker" aria-hidden="true">{completed?'✓':failed?'!':i+1}</span>
       <span><strong>{step.label}</strong><small>{completed?'Đã hoàn thành':active?'Đang thực hiện':failed?'Gặp lỗi':'Chờ xử lý'}</small></span>
      </li>;
     })}</ol>
     <p className="ww-progress-detail" aria-live="polite">{writingProgress.detail}</p>
     {writingProgress.model&&<p className="ww-progress-model">Model: {writingProgress.model}</p>}
     <p className="ww-note">Thanh hiển thị các bước đã thực sự hoàn thành, không ước lượng thời gian hoặc phần trăm tiến độ nội bộ của nhà cung cấp AI.</p>
    </section>
    <section className="ww-card"><div className="ww-card-head"><span className="ww-step">04</span><div><h2>Từ vựng Việt · Hàn · Anh <span className="ww-count">{rows.length}</span></h2><p>Đã ánh xạ đúng các cột A:F của Sheet1</p></div></div>
     <div className="ww-table-scroll"><table><thead><tr><th>Việt (A)</th><th>Hàn (B)</th><th>Anh (C)</th><th>Context (D)</th><th>Ngữ pháp (E)</th><th>Category (F)</th><th></th></tr></thead><tbody>{rows.map((v,i)=><tr key={i}>{['vi','ko','en','context','grammar','category'].map(k=><td key={k}><textarea rows={k==='grammar'?3:2} aria-label={k+' '+(i+1)} value={v[k]} onChange={e=>{setRows(old=>old.map((x,j)=>j===i?{...x,[k]:e.target.value}:x));setSheetWriteSucceeded(false);setDirty(true);}}/></td>)}<td><button className="ww-remove" aria-label={'Xóa dòng '+(i+1)} onClick={()=>{setRows(old=>old.filter((_,j)=>j!==i));setSheetWriteSucceeded(false);setDirty(true);}}>×</button></td></tr>)}</tbody></table></div>
     {!rows.length&&<p className="ww-empty">Chưa có từ vựng. Hãy tạo bài báo trước.</p>}
     <div className="ww-actions"><button onClick={()=>{setRows(old=>[...old,{vi:'',ko:'',en:'',context:'',grammar:'',category:'General / Everyday Language'}]);setSheetWriteSucceeded(false);setDirty(true);}}>+ Thêm từ</button><button disabled={running||!(title.trim()||article.trim()||rows.length)} onClick={resetVocabularySession} title="Tạo phiên mới: làm trống bản thảo và từ vựng trên Editor, không xóa Google Sheet">↻ Phiên từ vựng mới</button><button className="ww-primary" disabled={running||!access||!rows.length} onClick={push}>{busy==='sheet'?'Đang ghi Sheet…':'↗ Ghi từ mới vào Google Sheet'}</button></div>
    </section>
   </div></div>
   {error&&<div role="alert" className="ww-alert ww-error">{error}</div>}
   {notice&&<div role="status" className="ww-alert">{notice}</div>}
  </main><footer className="ww-footer">Duy Nguyen · AI-assisted writing · Nội dung cần biên tập, kiểm chứng trước khi công bố.</footer>
 </div>;
}
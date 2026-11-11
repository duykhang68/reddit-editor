// Model discovery is scoped to the user's own API keys: never assume public
// catalog availability also means this account is allowed to invoke a model.
const GEMINI_ROOT='https://generativelanguage.googleapis.com/v1beta';
const GROQ_ROOT='https://api.groq.com/openai/v1';
const DISCOVERY_TIMEOUT_MS=12000;
const GENERATION_TIMEOUT_MS=30000;
// Bound requests to prevent an unresponsive AI model from blocking the editor indefinitely.
async function timedFetch(fetcher,url,options={},timeoutMs=GENERATION_TIMEOUT_MS){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{return await fetcher(url,{...options,signal:controller.signal});}
 catch(error){if(controller.signal.aborted)throw Error('Yêu cầu quá thời gian '+Math.round(timeoutMs/1000)+' giây.');throw error;}
 finally{clearTimeout(timer);}
}

const GEMINI_PREFERENCE=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite'];
const GROQ_PREFERENCE=['qwen/qwen3.8-27b','openai/gpt-oss-120b','qwen/qwen3.6-27b'];
const safeGemini=id=>/^gemini-3\.(?:8|7|6|5|1)-[a-z0-9-]+$/.test(id)
 && !/(?:live|tts|audio|image|transcribe|translate|preview|experimental|exp)/.test(id);
const safeGroq=id=>GROQ_PREFERENCE.includes(id)
 || /^openai\/gpt-oss-(?:20b|120b)$/.test(id)
 || /^qwen\/qwen3\.[6-9]-\d+b$/.test(id);
export function chooseGeminiModels(items){
 const ids=(items||[]).filter(x=>(x.supportedGenerationMethods||[]).includes('generateContent'))
  .map(x=>String(x.name||'').replace(/^models\//,'')).filter(safeGemini);
 return [...new Set(ids)].sort((a,b)=>{
  const ia=GEMINI_PREFERENCE.indexOf(a),ib=GEMINI_PREFERENCE.indexOf(b);
  return (ia<0?100:ia)-(ib<0?100:ib)||a.localeCompare(b);
 });
}
export function chooseGroqModels(items){
 const ids=(items||[]).filter(x=>x.active!==false).map(x=>String(x.id||'')).filter(safeGroq);
 return [...new Set(ids)].sort((a,b)=>{
  const ia=GROQ_PREFERENCE.indexOf(a),ib=GROQ_PREFERENCE.indexOf(b);
  return (ia<0?100:ia)-(ib<0?100:ib)||a.localeCompare(b);
 });
}
async function jsonResponse(response){
 const raw=await response.json().catch(()=>({}));
 if(!response.ok)throw Error((typeof raw.error==='string'?raw.error:raw.error?.message)||'HTTP '+response.status);
 return raw;
}
export async function listGeminiModels(key,fetcher=fetch){
 const all=[];let page='';
 for(let i=0;i<4;i++){
  const url=GEMINI_ROOT+'/models?pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):'');
  const data=await jsonResponse(await timedFetch(fetcher,url,{headers:{'x-goog-api-key':key}},DISCOVERY_TIMEOUT_MS));
  all.push(...(data.models||[]));page=data.nextPageToken||'';if(!page)break;
 }
 return chooseGeminiModels(all);
}
export async function listGroqModels(key,fetcher=fetch){
 const data=await jsonResponse(await timedFetch(fetcher,GROQ_ROOT+'/models',{headers:{Authorization:'Bearer '+key}},DISCOVERY_TIMEOUT_MS));
 return chooseGroqModels(data.data||[]);
}
export async function generateGemini(key,prompt,fetcher=fetch,onProgress=()=>{}){
 onProgress({type:'discovery',provider:'Gemini'});
 const models=await listGeminiModels(key,fetcher);
 if(!models.length)throw Error('API key Gemini không có model tạo văn bản Gemini 3 được cấp quyền.');
 const errors=[];
 for(const model of models.slice(0,2)){
  onProgress({type:'generation',provider:'Gemini',model});
  try{
   const data=await jsonResponse(await timedFetch(fetcher,GEMINI_ROOT+'/models/'+encodeURIComponent(model)+':generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature:0.45,maxOutputTokens:8192}})
   },GENERATION_TIMEOUT_MS));
   const text=(data.candidates?.[0]?.content?.parts||[]).map(x=>x.text||'').join('');
   if(!text.trim())throw Error('Model không trả về nội dung văn bản.');
   return {text,model};
  }catch(e){onProgress({type:'retry',provider:'Gemini',model});errors.push(model+': '+String(e.message||e).slice(0,150));}
 }
 throw Error('Không model Gemini nào hoàn thành: '+errors.join(' | '));
}
export async function generateGroq(key,prompt,fetcher=fetch,onProgress=()=>{}){
 onProgress({type:'discovery',provider:'Groq'});
 const models=await listGroqModels(key,fetcher);
 if(!models.length)throw Error('API key Groq không có model tạo bài tương thích được cấp quyền.');
 const errors=[];
 for(const model of models.slice(0,2)){
  onProgress({type:'generation',provider:'Groq',model});
  try{
   const data=await jsonResponse(await timedFetch(fetcher,GROQ_ROOT+'/chat/completions',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
    body:JSON.stringify({model,temperature:0.4,max_completion_tokens:7000,response_format:{type:'json_object'},messages:[{role:'system',content:'Return valid JSON only.'},{role:'user',content:prompt}]})
   },GENERATION_TIMEOUT_MS));
   const text=data.choices?.[0]?.message?.content||'';
   if(!text.trim())throw Error('Model không trả về nội dung văn bản.');
   return {text,model};
  }catch(e){onProgress({type:'retry',provider:'Groq',model});errors.push(model+': '+String(e.message||e).slice(0,150));}
 }
 throw Error('Không model Groq nào hoàn thành: '+errors.join(' | '));
}

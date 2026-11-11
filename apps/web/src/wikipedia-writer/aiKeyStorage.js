// Explicit per-device, opt-in API-key persistence for Wikipedia Writer.
// Keys remain plaintext in browser localStorage; never send to Drive, Sheets,
// GitHub, logs, analytics, or the app's server.
export const WIKIPEDIA_AI_KEY_STORAGE = 'dn-wikipedia-writer-ai-keys-v1';

export function readRememberedAiKeys(storage) {
  try {
    const raw=storage?.getItem(WIKIPEDIA_AI_KEY_STORAGE);
    if(!raw)return {remember:false,gemini:'',groq:''};
    const parsed=JSON.parse(raw);
    if(parsed?.remember!==true)return {remember:false,gemini:'',groq:''};
    return {remember:true,gemini:typeof parsed.gemini==='string'?parsed.gemini:'',groq:typeof parsed.groq==='string'?parsed.groq:''};
  }catch{return {remember:false,gemini:'',groq:''};}
}
export function persistAiKeys(storage,remember,gemini,groq){
  if(!storage)return false;
  try{
    if(remember)storage.setItem(WIKIPEDIA_AI_KEY_STORAGE,JSON.stringify({remember:true,gemini:String(gemini||''),groq:String(groq||'')}));
    else storage.removeItem(WIKIPEDIA_AI_KEY_STORAGE);
    return true;
  }catch{return false;}
}

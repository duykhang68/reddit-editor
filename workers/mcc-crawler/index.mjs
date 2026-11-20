// Dedicated scheduled *source monitor*. Never infer cashback rates from changed HTML/PDF.
// Requires GOOGLE_SERVICE_ACCOUNT_JSON as Worker secret and Sheet shared with client_email.
const ID='18HueEhTZMv8VErQcQrRR60q1RXjbspAtyysB9PjJTAo';
const allowed=new Set(['www.hsbc.com.vn','hsbc.com.vn','www.vib.com.vn','vib.com.vn',
'www.vpbank.com.vn','vpbank.com.vn','www.acb.com.vn','acb.com.vn']);
const bytes=new TextEncoder();
const b64=v=>btoa(String.fromCharCode(...new Uint8Array(v))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function token(env){
 const a=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||'null');
 if(!a?.client_email||!a?.private_key)throw Error('Missing service account secret');
 const t=Math.floor(Date.now()/1000),h=b64(bytes.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const b=b64(bytes.encode(JSON.stringify({iss:a.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:t,exp:t+3600})));
 const raw=Uint8Array.from(atob(a.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0));
 const k=await crypto.subtle.importKey('pkcs8',raw,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',k,bytes.encode(h+'.'+b)));
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:h+'.'+b+'.'+signature})});
 if(!r.ok)throw Error('Google OAuth '+r.status);return (await r.json()).access_token;
}
async function sheets(auth,path,opts={}){
 const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+ID+path,{...opts,headers:{authorization:'Bearer '+auth,...opts.headers}});
 if(!r.ok)throw Error('Google Sheets '+r.status+' '+path);return r.json();
}
const range=s=>'/values/'+encodeURIComponent(s);
async function append(auth,tab,rows){
 if(!rows.length)return;
 await sheets(auth,range("'"+tab+"'!A1")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({values:rows})});
}
function safeSource(input){
 try{const u=new URL(input);return u.protocol==='https:'&&allowed.has(u.hostname)&&!u.username&&!u.password?u:null}catch{return null}
}
async function inspect(url){
 const response=await fetch(url,{redirect:'manual',headers:{accept:'text/html,application/pdf;q=0.8,*/*;q=0.2','user-agent':'OneBlog-MCC-SourceMonitor/1.0'},signal:AbortSignal.timeout(20000)});
 const len=Number(response.headers.get('content-length')||0);
 if(!response.ok||len>8e6||response.status>=300)throw Error('Official source HTTP '+response.status);
 const t=response.headers.get('content-type')||'';
 if(!/text\/html|application\/pdf|text\/plain|application\/octet-stream/i.test(t))throw Error('Content-Type refused');
 const body=await response.arrayBuffer();if(body.byteLength>8e6)throw Error('Document too large');
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function checkSources(env){
 const auth=await token(env);
 const data=await sheets(auth,range("'Sources'!A2:G1000"));
 const rows=data.values||[],updates=[],logs=[],review=[],now=new Date().toISOString();
 for(let i=0;i<Math.min(rows.length,40);i++){
  const r=rows[i],url=safeSource(String(r[2]||''));if(!url)continue;
  try{
   const hash=await inspect(url.href),old=String(r[3]||''),changed=Boolean(old&&old!==hash);
   updates.push({range:"'Sources'!D"+(i+2)+":G"+(i+2),values:[[hash,changed?'CHANGED_REVIEW':'OK',now,now]]});
   logs.push([now,url.href,'200',hash,changed?'CHANGED':old?'UNCHANGED':'BASELINE','OK','']);
   if(changed)review.push([now,r[0]||'',r[1]||'','','SOURCE_CHANGED','RECHECK_REQUIRED',url.href,'PENDING']);
  }catch(error){logs.push([now,url.href,'ERROR','','','FAILED',String(error.message||error).slice(0,150)])}
 }
 // Only one scheduled instance should run. No speculative cashback data is published.
 if(updates.length)await sheets(auth,'/values:batchUpdate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data:updates})});
 await append(auth,'Crawl_Log',logs);await append(auth,'Review_Queue',review);
 return {checked:logs.length,changed:review.length,errors:logs.filter(x=>x[5]==='FAILED').length};
}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(checkSources(env).then(result=>console.log('MCC_CRAWL',JSON.stringify(result))).catch(e=>console.error('MCC_CRAWL_FAILED',String(e.message||e))))},
 async fetch(){return new Response('MCC source monitor (scheduled only)',{status:200,headers:{'cache-control':'no-store'}})}
};

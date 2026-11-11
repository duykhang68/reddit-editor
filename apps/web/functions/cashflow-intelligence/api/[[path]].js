import {readLedger,report,saveDeletions} from '../../../src/cashflow-intelligence/ledger.mjs';
// Cashflow Intelligence · Google Sign-In protected, first-party Pages API.
// Uses the existing Editor GOOGLE_CLIENT_ID + APP_SECRET and an authenticated D1 binding.
// No dashboard Access Key, no public transaction details, no Google Drive scope.
// Routes: /cashflow-intelligence/api/{config,session,me,logout,summary,transactions,insights}.
const ROOT='/cashflow-intelligence/api/';
const enc=new TextEncoder();
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store, private','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
const b64=x=>{let s='';for(const b of x)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const fromB64=x=>Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-x.length%4)%4)),c=>c.charCodeAt(0));
const cookieName='__Host-cashflow_google_session';
const maxAge=604800;
const cookie=(v,age=maxAge)=>cookieName+'='+v+'; Path=/; Max-Age='+age+'; HttpOnly; Secure; SameSite=Lax';
function getCookie(raw){const key=cookieName+'=';return String(raw||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(key))?.slice(key.length)||''}
async function signingKey(env){
 const s=String(env.APP_SECRET||'');
 if(s.length<48)throw Error('SESSION_SECRET_MISSING');
 return crypto.subtle.importKey('raw',enc.encode('tet-dinh-mui-cashflow-google-session-v1:'+s),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function makeSession(env,data){
 const exp=Math.floor(Date.now()/1000)+maxAge;
 const body=b64(enc.encode(JSON.stringify({sub:data.sub,email:data.email,exp,v:1})));
 const sig=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),enc.encode(body))));
 return body+'.'+sig;
}
async function readSession(env,request){
 try{
  const value=getCookie(request.headers.get('cookie')),parts=value.split('.');
  if(parts.length!==2||parts[0].length>2500||parts[1].length>180)return null;
  const verified=await crypto.subtle.verify('HMAC',await signingKey(env),fromB64(parts[1]),enc.encode(parts[0]));
  if(!verified)return null;
  const item=JSON.parse(new TextDecoder().decode(fromB64(parts[0])));
  if(item.v!==1||!item.sub||!item.email||!Number.isFinite(item.exp)||item.exp<=Date.now()/1000)return null;
  const allowed=String(env.CASHFLOW_ALLOWED_GOOGLE_EMAILS||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  if(!allowed.includes(String(item.email).toLowerCase()))return null;
  return item;
 }catch{return null}
}
function clientId(env){const id=String(env.GOOGLE_CLIENT_ID||'').trim();return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id)?id:''}
async function googleIdentity(credential,client){
 if(typeof credential!=='string'||credential.length<100||credential.length>8192)return null;
 const url='https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(credential);
 const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)return null;
 const value=await response.json();
 if(value.aud!==client||!['accounts.google.com','https://accounts.google.com'].includes(value.iss)
    ||String(value.email_verified)!=='true'||!value.sub||!value.email
    ||Number(value.exp)<=Math.floor(Date.now()/1000))return null;
 return {sub:String(value.sub),email:String(value.email).toLowerCase()};
}
export async function onRequest({request,env}){
 const url=new URL(request.url);
 if(!url.pathname.startsWith(ROOT))return reply({error:'not_found'},404);
 const route=url.pathname.slice(ROOT.length).replace(/\/$/,'');
 if(route==='config'&&request.method==='GET'){
  const id=clientId(env);
  return id?reply({clientId:id}):reply({error:'google_oauth_not_configured'},503);
 }
 if(route==='session'&&request.method==='POST'){
  if(request.headers.get('origin')!==url.origin)return reply({error:'invalid_origin'},403);
  if(!clientId(env)||!env.APP_SECRET)return reply({error:'google_oauth_not_configured'},503);
  const json=await request.json().catch(()=>null);
  const identity=await googleIdentity(json?.credential,clientId(env)).catch(()=>null);
  if(!identity)return reply({error:'invalid_google_identity'},401);
  const allowed=String(env.CASHFLOW_ALLOWED_GOOGLE_EMAILS||'').toLowerCase().split(',').map(x=>x.trim());
  if(!allowed.includes(identity.email))return reply({error:'google_account_not_authorized'},403);
  const value=await makeSession(env,identity);
  return reply({ok:true,email:identity.email},200,{'set-cookie':cookie(value)});
 }
 if(route==='logout'&&request.method==='POST'){
  if(request.headers.get('origin')!==url.origin)return reply({error:'invalid_origin'},403);
  return reply({ok:true},200,{'set-cookie':cookie('',0)});
 }
 if(!['GET','POST'].includes(request.method))return reply({error:'method_not_allowed'},405);
 if(request.method==='POST'&&request.headers.get('origin')!==url.origin)return reply({error:'invalid_origin'},403);
 const identity=await readSession(env,request);
 if(!identity)return reply({error:'google_login_required'},401);
 if(route==='me')return reply({authenticated:true,email:identity.email});
 if(!env.CASHFLOW_DB)return reply({error:'cashflow_db_not_configured'},503);
 try{
  if(route==='reprocess'&&request.method==='POST'){
   const raw=await request.text();if(raw.length>2000)return reply({error:'payload_too_large'},413);
   const body=JSON.parse(raw);
   if(!/^[0-9a-f-]{36}$/i.test(body.id)||typeof body.updated_at!=='string')return reply({error:'invalid_transaction'},400);
   if(!env.CASHFLOW_BACKEND?.reprocessReceipt)return reply({error:'cashflow_backend_unavailable'},503);
   const result=await env.CASHFLOW_BACKEND.reprocessReceipt(body.id,body.updated_at);
   return reply(result,result.error?(result.error==='transaction_changed'?409:422):200);
  }
  if(route==='save'&&request.method==='POST'){
   const raw=await request.text();if(raw.length>20000)return reply({error:'payload_too_large'},413);
   const body=JSON.parse(raw);
   return reply(await saveDeletions(env.CASHFLOW_DB,body,identity.email));
  }
  if(request.method!=='GET')return reply({error:'method_not_allowed'},405);
  if(['ledger','summary','transactions','insights','snapshot'].includes(route)){
   const data=report(await readLedger(env.CASHFLOW_DB));
   if(route==='snapshot')return reply({kind:'duynguyen-cashflow-snapshot-v1',savedAt:new Date().toISOString(),account:identity.email,revision:data.revision,transactions:data.transactions});
   return reply(data);
  }
  return reply({error:'not_found'},404);
 }catch(e){return reply({error:e.status?e.message:'cashflow_query_failed'},e.status||503)}
}

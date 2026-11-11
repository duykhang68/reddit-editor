// All-site Google sign-in gate for Duy Nguyen Editor + utility pages.
// Reuses Cashflow's 7-day signed Google session, verified with the Pages APP_SECRET.
// This must run before static assets and Pages Functions, including API endpoints.
const NAME='__Host-cashflow_google_session',enc=new TextEncoder(),dec=new TextDecoder();
const getCookie=r=>String(r||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(NAME+'='))?.slice(NAME.length+1)||'';
const fromB64=x=>Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-x.length%4)%4)),c=>c.charCodeAt(0));
async function verified(env,request){
 try{
  const raw=getCookie(request.headers.get('cookie')),parts=raw.split('.');
  if(parts.length!==2||parts[0].length>2500||parts[1].length>180)return false;
  const secret=String(env.APP_SECRET||'');if(secret.length<48)return false;
  const key=await crypto.subtle.importKey('raw',enc.encode('tet-dinh-mui-cashflow-google-session-v1:'+secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const ok=await crypto.subtle.verify('HMAC',key,fromB64(parts[1]),enc.encode(parts[0]));
  if(!ok)return false;
  const claims=JSON.parse(dec.decode(fromB64(parts[0])));
  if(claims.v!==1||!claims.sub||!claims.email||!Number.isFinite(claims.exp)||claims.exp<Date.now()/1000)return false;
  const allowed=String(env.CASHFLOW_ALLOWED_GOOGLE_EMAILS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
  return allowed.includes(String(claims.email).toLowerCase());
 }catch{return false}
}
function publicPath(p){
 // Login must load its three public JavaScript modules before a session exists.
 // These modules contain UI/OAuth code only; financial APIs still verify cookies.
 if(/^\/assets\/(?:cashflowIntelligence|driveClientResolver|googleDriveService)-[A-Za-z0-9_-]+\.js$/.test(p))return true;
 if(p==='/cashflow-intelligence'||p==='/cashflow-intelligence/'||p==='/cashflow-intelligence/index.html')return true;
 if(p.startsWith('/cashflow-intelligence/api/'))return true; // individual API verifies session
 if(p.startsWith('/auth/google/'))return true; // Blogger OAuth callback must complete
 if(p==='/api/health'||p==='/api/ga4-public')return true; // existing public integrations
 if(p.startsWith('/blogger-assets/'))return true; // public Blogger theme assets
 return false;
}
export async function onRequest(context){
 const request=context.request,url=new URL(request.url),pathname=url.pathname;
 if(publicPath(pathname))return context.next();
 if(await verified(context.env,request))return context.next();
 if(request.method==='GET'||request.method==='HEAD'){
  const redirect=new URL('/cashflow-intelligence/',url.origin);
  if(pathname!=='/')redirect.searchParams.set('return_to',pathname.startsWith('/')?pathname:'/');
  // No-store to prevent caching private pages behind the login state.
  return new Response(null,{status:302,headers:{Location:redirect.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 return new Response(JSON.stringify({error:'google_login_required'}),{status:401,headers:{'content-type':'application/json','cache-control':'no-store'}});
}

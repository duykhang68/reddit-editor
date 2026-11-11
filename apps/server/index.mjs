import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sanitizeHtml from 'sanitize-html';
import { loadGa4Traffic } from '../web/src/services/ga4Traffic.mjs';
import {getVocabularySheet} from '../web/src/services/vocabularySheet.mjs';
import { randomToken, deriveKey, seal, unseal, secureEquals, codeChallenge, BLOGGER_SCOPE, BLOGGER_BASE, numericId, normalizeInput, safePost, readCookies, errorStatus, validatePublishDate } from './lib.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const SESSION_PATH=path.join(HERE,'data','sessions.enc');
const MAX_BODY=300_000;
const DIST=path.resolve(HERE,'../web/dist');
const SESSION_AGE=7*24*60*60*1000;
function cfg(){
  const get=k=>String(process.env[k]||'').trim();
  const c={clientId:get('GOOGLE_CLIENT_ID'),clientSecret:get('GOOGLE_CLIENT_SECRET'),redirect:get('GOOGLE_REDIRECT_URI'),frontend:get('FRONTEND_ORIGIN')||'http://localhost:5173',host:get('EDITOR_BIND_HOST')||'localhost',port:Number(get('PORT')||3000),blogId:get('BLOGGER_BLOG_ID'),secret:get('APP_SECRET'),secure:get('COOKIE_SECURE')==='true'};
  if(!c.clientId||!c.clientSecret||c.clientId.includes('PASTE_')||c.clientSecret.includes('PASTE_'))throw Error('Thiếu GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET trong apps/server/.env');
  if(!c.secret||c.secret.length<48||c.secret.includes('GENERATE_'))throw Error('APP_SECRET chưa đúng. Dùng: openssl rand -hex 32');
  if(!c.redirect||!c.redirect.endsWith('/auth/google/callback'))throw Error('GOOGLE_REDIRECT_URI không đúng');
  if(!/^https?:\/\//.test(c.frontend))throw Error('FRONTEND_ORIGIN không hợp lệ');
  return c;
}

function sanitizeContent(html) {
  return sanitizeHtml(html, {
    allowedTags: [...new Set([...sanitizeHtml.defaults.allowedTags,'img','h1','h2','figure','figcaption','aside','details','summary','hr','s','u','table','thead','tbody','tr','th','td'])],
    allowedAttributes: {
      a:['href','title','target','rel'], img:['src','alt','title','width','height','loading'],
      '*':['class'], td:['colspan','rowspan'],th:['colspan','rowspan','scope'],
      aside:['data-kind','data-series','hidden'],details:['open']
    },
    allowedSchemes:['http','https','mailto'],
    allowedSchemesByTag:{img:['http','https']},
    allowProtocolRelative:false,
    disallowedTagsMode:'discard',
    transformTags:{'a':sanitizeHtml.simpleTransform('a',{rel:'noopener noreferrer'},true)}
  });
}
// Read the Series marker that survives sanitize-html; never parse arbitrary HTML scripts.
function seriesFromContent(html) {
  const marker=String(html||'').match(/<aside\b(?=[^>]*\bdata-kind=["']series-metadata["'])[^>]*>/i);
  const encoded=marker?.[0].match(/\bdata-series=["']([^"']+)["']/i)?.[1];
  if (!encoded) return null;
  try {
    const value=JSON.parse(decodeURIComponent(encoded));
    const name=String(value?.name||'').trim();
    const part=Number(value?.part), total_parts=Number(value?.total_parts);
    if (!name||!Number.isInteger(part)||part<1||!Number.isInteger(total_parts)||total_parts<part||total_parts>9999) return null;
    return {name,part,total_parts,target_date:String(value.target_date||''),status:part===total_parts?'completed':'in_progress'};
  } catch {return null;}
}
function json(res,status,payload,extra={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});
  res.end(JSON.stringify(payload));
}
function redirect(res,to,extra={}){res.writeHead(302,{Location:to,'Cache-Control':'no-store',...extra});res.end();}
function fail(status,message){return Object.assign(new Error(message),{status});}
function readBody(req){return new Promise((resolve,reject)=>{
  let raw='',length=0;
  req.on('data',chunk=>{length+=chunk.length;if(length>MAX_BODY){reject(fail(413,'Yêu cầu quá lớn'));req.destroy();return;}raw+=chunk.toString('utf8');});
  req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(fail(400,'Dữ liệu JSON không hợp lệ'));}});
  req.on('error',reject);
});}

export function createApp(config=cfg(),fetcher=fetch,sessionFile=SESSION_PATH){
  const key=deriveKey(config.secret);
  fs.mkdirSync(path.dirname(sessionFile),{recursive:true,mode:0o700});
  let sessions={};
  try{sessions=unseal(fs.readFileSync(sessionFile,'utf8'),key);}catch(e){if(e.code!=='ENOENT')throw Error('Không mở được sessions.enc; kiểm tra APP_SECRET và bản sao lưu. '+e.message);}
  function persist(){
    const now=Date.now();
    for(const id in sessions)if(sessions[id].expires<now)delete sessions[id];
    const tmp=sessionFile+'.'+process.pid+'.tmp';
    fs.writeFileSync(tmp,seal(sessions,key),{mode:0o600});fs.renameSync(tmp,sessionFile);
  }
  function cookie(id){return `dn_editor_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_AGE/1000}${config.secure?'; Secure':''}`;}
  function lookup(req){const id=readCookies(req.headers.cookie).dn_editor_session;return id&&sessions[id]?.expires>Date.now()?sessions[id]:null;}
  function startSession(){const id=randomToken();sessions[id]={id,csrf:randomToken(),created:Date.now(),expires:Date.now()+SESSION_AGE,token:null,flow:null};persist();return sessions[id];}
  function mustAuth(req){const s=lookup(req);if(!s?.token)throw fail(401,'Chưa kết nối Google. Hãy nhấn Kết nối Blogger.');return s;}
  function verifyWrite(req,s){
    const origin=req.headers.origin;
    const allowed=[config.frontend,`http://localhost:${config.port}`,`https://localhost:${config.port}`];
    if(!origin||!allowed.includes(origin))throw fail(403,'Nguồn yêu cầu không được phép');
    if(!secureEquals(req.headers['x-csrf-token'],s.csrf))throw fail(403,'Thiếu hoặc sai CSRF token; hãy tải lại trang');
  }
  async function tokenRequest(form){
    const resp=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form),signal:AbortSignal.timeout(15000)});
    const data=await resp.json();
    if(!resp.ok)throw fail(401,'Google từ chối token: '+String(data.error||'Không xác định').slice(0,150));
    return data;
  }
  async function accessToken(s){
    if(s.token?.access && s.token.expires>Date.now()+60_000)return s.token.access;
    if(!s.token?.refresh)throw fail(401,'Phiên đăng nhập hết hạn. Kết nối Google lại.');
    const result=await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:s.token.refresh,grant_type:'refresh_token'});
    s.token.access=result.access_token;s.token.expires=Date.now()+(result.expires_in||3600)*1000;
    persist();return s.token.access;
  }
  async function googleApi(s,method,route,query={},data){
    const url=new URL(BLOGGER_BASE+route);
    for(const [k,v] of Object.entries(query))if(v!==undefined && v!=='')url.searchParams.set(k,v);
    const run=async token=>fetcher(url,{method,headers:{Authorization:`Bearer ${token}`,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
    let response=await run(await accessToken(s));
    if(response.status===401 && s.token.refresh){s.token.expires=0;response=await run(await accessToken(s));}
    const body=await response.json().catch(()=>({}));
    if(!response.ok){
      const msg=String(body?.error?.message||response.statusText||'Google API error').slice(0,350);
      const error=fail(response.status===403?403:response.status===404?404:response.status===401?401:502,`Blogger API: ${msg} (${method} ${route}, HTTP ${response.status})`);
      // Log only diagnostic fields; never the Authorization header, body or page token.
      error.blogger={method,path:url.pathname,httpStatus:response.status,code:String(body?.error?.status||'').slice(0,80),parameters:Object.fromEntries([...url.searchParams].filter(([name])=>['status','view','orderBy','maxResults','fetchBodies','isDraft'].includes(name)))};
      throw error;
    }
    return body;
  }
  async function checkedBlog(s,id){id=numericId(id);if(config.blogId&&id!==config.blogId)throw fail(403,'Blog ID không khớp BLOGGER_BLOG_ID trong .env');return id;}
  function draftOnly(post){if(String(post.status||'').toLowerCase()!=='draft')throw fail(409,'Bài viết đã xuất bản hoặc không phải bản nháp. Không ghi đè bài đang công khai.');}
  async function getPost(s,blogId,postId){return googleApi(s,'GET',`/blogs/${blogId}/posts/${numericId(postId)}`,{view:'ADMIN'});}
  async function handler(req,res){
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
    const url=new URL(req.url,`http://localhost:${config.port}`);
    try{
      if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,service:'DuyNguyen Blogger Editor',revision:'blog-list-default-view-2026-11-06'});
      if(req.method==='GET'&&url.pathname==='/api/status'){
        let s=lookup(req);if(!s){s=startSession();res.setHeader('Set-Cookie',cookie(s.id));}
        return json(res,200,{connected:!!s.token,csrf:s.csrf,defaultBlogId:config.blogId||null});
      }
      if(req.method==='GET'&&url.pathname==='/auth/google/start'){
        let s=lookup(req);if(!s){s=startSession();res.setHeader('Set-Cookie',cookie(s.id));}
        const state=randomToken(),verifier=randomToken(48);
        const analyticsRequested=url.searchParams.get('return_to')==='research-insights'&&url.searchParams.get('analytics')==='1';
        s.flow={state,verifier,expires:Date.now()+10*60_000,analyticsRequested,returnTo:url.searchParams.get('return_to')==='vocabulary-insights'?'/vocabulary-insights/':url.searchParams.get('return_to')==='/quality-gate'?'/quality-gate':url.searchParams.get('return_to')==='research-insights'?'/research-insights.html':'/'};persist();
        const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
        Object.entries({client_id:config.clientId,redirect_uri:config.redirect,response_type:'code',scope:analyticsRequested?BLOGGER_SCOPE+' https://www.googleapis.com/auth/analytics.readonly':BLOGGER_SCOPE,access_type:'offline',prompt:'consent',state,code_challenge:codeChallenge(verifier),code_challenge_method:'S256'}).forEach(([k,v])=>auth.searchParams.set(k,v));
        return redirect(res,auth.toString());
      }
      if(req.method==='GET'&&url.pathname==='/auth/google/callback'){
        const s=lookup(req);
        if(!s?.flow||s.flow.expires<Date.now()||!secureEquals(s.flow.state,url.searchParams.get('state')))throw fail(400,'OAuth state không khớp hoặc đã hết hạn. Hãy thử kết nối lại.');
        const flow=s.flow;s.flow=null;persist();
        if(url.searchParams.has('error'))throw fail(400,'Google từ chối truy cập: '+url.searchParams.get('error'));
        const code=url.searchParams.get('code');if(!code)throw fail(400,'Google không trả authorization code');
        const result=await tokenRequest({client_id:config.clientId,client_secret:config.clientSecret,code,code_verifier:flow.verifier,redirect_uri:config.redirect,grant_type:'authorization_code'});
        const old=s.token||{};if(!result.refresh_token && !old.refresh)throw fail(401,'Chưa có refresh token. Hãy thu hồi quyền app trong Google Account rồi kết nối lại.');
        // Rotate the session ID after the OAuth callback to prevent session fixation.
        const newer=startSession();newer.token={access:result.access_token,refresh:result.refresh_token||old.refresh,expires:Date.now()+(result.expires_in||3600)*1000,analytics:!!flow.analyticsRequested&&(!result.scope||result.scope.split(/\s+/).includes('https://www.googleapis.com/auth/analytics.readonly'))};
        delete sessions[s.id];persist();
        return redirect(res,config.frontend+(['/quality-gate','/research-insights.html','/vocabulary-insights/'].includes(flow.returnTo)?flow.returnTo:'/')+'?connected=1',{'Set-Cookie':cookie(newer.id)});
      }
      if(req.method==='POST'&&url.pathname==='/api/logout'){
        const s=lookup(req);if(!s)throw fail(401,'Chưa đăng nhập');verifyWrite(req,s);
        delete sessions[s.id];persist();
        return json(res,200,{ok:true},{'Set-Cookie':`dn_editor_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.secure?'; Secure':''}`});
      }
      if(!url.pathname.startsWith('/api/')){
        if(req.method!=='GET')return json(res,405,{error:'Phương thức không được hỗ trợ'});
        const normalized=path.posix.normalize(url.pathname);
        const rel=normalized.replace(/^\/+/, '');
        const assetPath=path.resolve(DIST,rel);
        const within=assetPath.startsWith(DIST+path.sep);
        const candidate=within && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()?assetPath:path.join(DIST,'index.html');
        if(!fs.existsSync(candidate))return json(res,404,{error:'Chưa có giao diện build. Dùng npm run dev hoặc npm run build.'});
        if(path.extname(rel)&&candidate.endsWith('/index.html'))return json(res,404,{error:'Không tìm thấy tệp tĩnh'});
        const ext=path.extname(candidate);const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.woff2':'font/woff2'}[ext]||'application/octet-stream';
        res.writeHead(200,{'Content-Type':mime,'Cache-Control':ext==='.html'?'no-store':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
        return fs.createReadStream(candidate).pipe(res);
      }
      const s=mustAuth(req);
      if(req.method==='GET'&&url.pathname==='/api/vocabulary-sheet'){
        await accessToken(s);
        return json(res,200,await getVocabularySheet({
          serviceAccountJson:process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
          force:url.searchParams.get('refresh')==='1'
        }));
      }
      if(req.method==='GET'&&url.pathname==='/api/ga4-traffic'){
        if(!s.token.analytics)return json(res,200,{status:'needs_consent'});
        const ga4=await loadGa4Traffic({fetcher,token:await accessToken(s),propertyId:process.env.GA4_PROPERTY_ID||s.ga4PropertyId||'563038949'});
        if(ga4.status==='connected'){s.ga4PropertyId=ga4.propertyId;persist();}
        return json(res,200,ga4);
      }
      if(req.method==='GET'&&url.pathname==='/api/blogs'){
        // Let Blogger choose the caller's role; forcing ADMIN can return INVALID_ARGUMENT.
        const result=await googleApi(s,'GET','/users/self/blogs');
        return json(res,200,{blogs:(result.items||[]).map(b=>({id:String(b.id),name:b.name,url:b.url})),defaultBlogId:config.blogId||null});
      }
      if(req.method==='GET'&&url.pathname==='/api/posts'){
        const blogId=await checkedBlog(s,url.searchParams.get('blogId'));
        const status=url.searchParams.get('status')||'draft';if(!['draft','live','scheduled'].includes(status))throw fail(400,'status phải là draft, live hoặc scheduled');
        const pageToken=(url.searchParams.get('pageToken')||'').slice(0,800);
        // Current discovery schema uses uppercase enums; the older reference shows lowercase.
        const result=await googleApi(s,'GET',`/blogs/${blogId}/posts`,{status:status.toUpperCase(),view:'ADMIN',fetchBodies:'false',orderBy:'UPDATED',maxResults:'30',pageToken});
        return json(res,200,{posts:(result.items||[]).map(p=>{const x=safePost(p);delete x.content;return x;}),nextPageToken:result.nextPageToken||null});
      }
      if(req.method==='GET'&&url.pathname==='/api/series'){
        const blogId=await checkedBlog(s,url.searchParams.get('blogId'));
        const name=String(url.searchParams.get('name')||'').trim();
        if(!name||name.length>180)throw fail(400,'Tên Series phải có 1–180 ký tự');
        const posts=[];
        const cursors={DRAFT:(url.searchParams.get('draftToken')||'').slice(0,800),LIVE:(url.searchParams.get('liveToken')||'').slice(0,800)};
        for(const status of ['DRAFT','LIVE']){
          if(cursors[status]==='done')continue;
          const result=await googleApi(s,'GET',`/blogs/${blogId}/posts`,{status,view:'ADMIN',fetchBodies:'true',orderBy:'UPDATED',maxResults:'100',pageToken:cursors[status]});
          for(const post of result.items||[]){
            const series=seriesFromContent(post.content);
            if(series?.name.toLocaleLowerCase()===name.toLocaleLowerCase())
              posts.push({id:String(post.id),title:String(post.title||''),url:String(post.url||''),status:post.status||status,series});
          }
          cursors[status]=result.nextPageToken||'done';
        }
        return json(res,200,{posts,partial:cursors.DRAFT!=='done'||cursors.LIVE!=='done',nextDraftToken:cursors.DRAFT,nextLiveToken:cursors.LIVE});
      }
      const one=url.pathname.match(/^\/api\/posts\/(\d+)$/);
      if(req.method==='GET'&&one){const blogId=await checkedBlog(s,url.searchParams.get('blogId'));return json(res,200,{post:safePost(await getPost(s,blogId,one[1]))});}
      if(req.method==='POST'&&url.pathname==='/api/drafts'){
        verifyWrite(req,s);const input=await readBody(req);const blogId=await checkedBlog(s,input.blogId);
        const payload=normalizeInput(input);payload.content=sanitizeContent(payload.content);
        const post=await googleApi(s,'POST',`/blogs/${blogId}/posts`,{isDraft:'true'},payload);
        return json(res,201,{post:safePost(post)});
      }
      const patch=url.pathname.match(/^\/api\/drafts\/(\d+)$/);
      if(req.method==='PATCH'&&patch){
        verifyWrite(req,s);const input=await readBody(req);const blogId=await checkedBlog(s,input.blogId);
        const current=await getPost(s,blogId,patch[1]);draftOnly(current);
        if(!input.expectedUpdated||current.updated!==input.expectedUpdated)throw fail(409,'Bản nháp đã được thay đổi trên Blogger. Hãy tải lại bài và đối chiếu trước khi lưu.');
        const payload=normalizeInput(input);payload.content=sanitizeContent(payload.content);
        const post=await googleApi(s,'PATCH',`/blogs/${blogId}/posts/${patch[1]}`,{},payload);
        return json(res,200,{post:safePost(post)});
      }
      if(one&&(req.method==='PATCH'||req.method==='DELETE')){
        verifyWrite(req,s);const input=await readBody(req),blogId=await checkedBlog(s,input.blogId);
        const current=await getPost(s,blogId,one[1]);
        if(!input.expectedUpdated||input.expectedUpdated!==current.updated)throw fail(409,'Bài viết thay đổi trên Blogger; hãy tải lại trước khi thao tác.');
        if(req.method==='DELETE'){
          const b=input.backup;
          if(!b||!/^[-_a-zA-Z0-9]{10,}$/.test(String(b.fileId||''))||String(b.postId)!==one[1]||String(b.blogId)!==blogId||String(b.updated)!==current.updated)
            throw fail(400,'Thiếu bản ghi backup Drive hợp lệ. Không xóa bài.');
          await googleApi(s,'DELETE',`/blogs/${blogId}/posts/${one[1]}`);
          return json(res,200,{deleted:true,id:one[1],backupFileId:b.fileId});
        }
        if(String(current.status||'').toLowerCase()==='scheduled')throw fail(409,'Hủy lịch bài trước khi chỉnh sửa.');
        const payload=normalizeInput(input);payload.content=sanitizeContent(payload.content);
        const changed=await googleApi(s,'PATCH',`/blogs/${blogId}/posts/${one[1]}`,{},payload);
        return json(res,200,{post:safePost(changed)});
      }
      // Blogger schedules the publication itself. Cloudflare rebuilds cannot publish Blogger posts.
      const scheduled=url.pathname.match(/^\/api\/schedule\/(\d+)$/);
      if(scheduled&&(req.method==='POST'||req.method==='DELETE')){
        verifyWrite(req,s);
        const input=await readBody(req);
        const blogId=await checkedBlog(s,input.blogId);
        // Validate BEFORE changing a scheduled post to draft.
        const publishDate=req.method==='POST'?validatePublishDate(input.publishDate):null;
        const current=await getPost(s,blogId,scheduled[1]);
        const state=String(current.status||'').toLowerCase();
        if(!['draft','scheduled'].includes(state))throw fail(409,'Chỉ có thể đặt lịch hoặc hủy lịch với bản nháp và bài đang lên lịch.');
        if(!input.expectedUpdated||current.updated!==input.expectedUpdated)
          throw fail(409,'Bài viết đã thay đổi trên Blogger. Hãy tải lại để tránh ghi đè lịch khác.');
        if(req.method==='DELETE'){
          if(state!=='scheduled')throw fail(409,'Bài viết hiện không có lịch đăng.');
          const draft=await googleApi(s,'POST',`/blogs/${blogId}/posts/${scheduled[1]}/revert`);
          return json(res,200,{post:safePost(draft)});
        }
        // A scheduled Blogger post must first be reverted to draft before rescheduling.
        if(state==='scheduled')await googleApi(s,'POST',`/blogs/${blogId}/posts/${scheduled[1]}/revert`);
        try{
          const result=await googleApi(s,'POST',`/blogs/${blogId}/posts/${scheduled[1]}/publish`,{publishDate});
          if(String(result.status||'').toLowerCase()!=='scheduled')
            throw fail(502,'Blogger không xác nhận trạng thái Scheduled. Vui lòng kiểm tra bài trong Blogger.');
          return json(res,200,{post:safePost(result)});
        }catch(e){
          if(state==='scheduled')e.message+=' Bài có thể đã trở về bản nháp; hãy tải lại danh sách trước khi thử lại.';
          throw e;
        }
      }
      const pub=url.pathname.match(/^\/api\/publish\/(\d+)$/);
      if(req.method==='POST'&&pub){
        verifyWrite(req,s);const input=await readBody(req);const blogId=await checkedBlog(s,input.blogId);
        const current=await getPost(s,blogId,pub[1]);draftOnly(current);
        if(!input.expectedUpdated||current.updated!==input.expectedUpdated)throw fail(409,'Bản nháp thay đổi trước khi Publish. Hãy tải lại trước.');
        const post=await googleApi(s,'POST',`/blogs/${blogId}/posts/${pub[1]}/publish`);
        return json(res,200,{post:safePost(post)});
      }
      return json(res,404,{error:'Không tìm thấy endpoint'});
    }catch(err){
      const status=errorStatus(err);
      if(status>=500||err.blogger)console.error('[server]',err.name,err.message,...(err.blogger?[err.blogger]:[]));
      if(!res.headersSent)json(res,status,{error:status===500?'Lỗi máy chủ. Xem log backend.':err.message});
    }
  }
  return http.createServer(handler);
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const config=cfg();const server=createApp(config);
    server.listen(config.port,config.host,()=>console.log(`\n✅ API: http://localhost:${config.port}   |   OAuth callback: ${config.redirect}\n`));
  }catch(error){console.error('❌',error.message);process.exit(1);}
}

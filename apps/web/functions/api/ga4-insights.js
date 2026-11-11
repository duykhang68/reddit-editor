// GA4 Insights: server-side, read-only reporting. No credential enters frontend bundles.
const PROPERTY='563038949', STREAM='16289663503';
const DATA='https://analyticsdata.googleapis.com/v1beta/properties/'+PROPERTY;
const textEncoder=new TextEncoder();
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
function base64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function base64decode(str){return Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4)),c=>c.charCodeAt(0));}
function eq(a,b){const x=textEncoder.encode(String(a||'')),y=textEncoder.encode(String(b||''));if(x.length!==y.length)return false;let mismatch=0;for(let i=0;i<x.length;i++)mismatch|=x[i]^y[i];return mismatch===0;}
async function accessToken(env){
 const raw=String(env.GA4_SERVICE_ACCOUNT_JSON||'');
 if(!raw)throw Object.assign(new Error('Cần cấu hình GA4_SERVICE_ACCOUNT_JSON trong Cloudflare Pages secrets.'),{code:'GA4_NOT_CONFIGURED',status:503});
 let account;try{account=JSON.parse(raw);}catch{throw Object.assign(new Error('GA4_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ.'),{status:503,code:'GA4_CONFIG_INVALID'});}
 if(account.type!=='service_account'||!account.client_email||!account.private_key)throw Object.assign(new Error('Cần JSON service account đầy đủ có client_email và private_key.'),{status:503,code:'GA4_CONFIG_INVALID'});
 // Prevent accidentally using a different credential than the granted GA4 property principal.
 if(account.client_email!=='blognaver-articlepdf@blognaver-automation-article.iam.gserviceaccount.com')throw Object.assign(new Error('Email service account không khớp tài khoản đã cấp quyền GA4.'),{status:503,code:'GA4_ACCOUNT_MISMATCH'});
 const now=Math.floor(Date.now()/1000);
 const h=base64url(textEncoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const p=base64url(textEncoder.encode(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/analytics.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3000})));
 let key;try{key=await crypto.subtle.importKey('pkcs8',base64decode(account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'')),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);}
 catch{throw Object.assign(new Error('Private key service account không hợp lệ.'),{status:503,code:'GA4_CONFIG_INVALID'});}
 const signature=base64url(new Uint8Array(await crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},key,textEncoder.encode(h+'.'+p))));
 const resp=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:h+'.'+p+'.'+signature}),signal:AbortSignal.timeout(12000)});
 const data=await resp.json().catch(()=>({}));
 if(!resp.ok||!data.access_token)throw Object.assign(new Error('Google không cấp access token cho service account. Kiểm tra khóa và quyền API.'),{status:502,code:'GA4_TOKEN_FAILED'});
 return data.access_token;
}
const filter={filter:{fieldName:'streamId',stringFilter:{matchType:'EXACT',value:STREAM}}};
const metricNames=['activeUsers','sessions','screenPageViews','engagedSessions','engagementRate','averageSessionDuration','eventCount'];
async function report(token,endpoint,payload){
 const r=await fetch(DATA+':'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(18000)});
 const d=await r.json().catch(()=>({}));
 if(!r.ok){const message=String(d.error?.message||'Analytics Data API lỗi '+r.status);
 const code=r.status===403?'GA4_PERMISSION_DENIED':r.status===429?'GA4_RATE_LIMIT':'GA4_API_FAILED';
 throw Object.assign(new Error(message.slice(0,280)),{status:r.status===429?503:502,code});}
 return d;
}
function rows(report){const dims=report.dimensionHeaders?.map(x=>x.name)||[],metrics=report.metricHeaders?.map(x=>x.name)||[];return (report.rows||[]).map(row=>({dimensions:Object.fromEntries(dims.map((x,i)=>[x,row.dimensionValues?.[i]?.value||''])),metrics:Object.fromEntries(metrics.map((x,i)=>[x,Number(row.metricValues?.[i]?.value||0)]))}));}
export async function onRequestGet({request,env}){
 const required=String(env.GA4_INSIGHTS_ACCESS_KEY||'').trim();
 if(!required)return json({code:'GA4_DASHBOARD_LOCKED',error:'Chưa cấu hình GA4_INSIGHTS_ACCESS_KEY để bảo vệ báo cáo riêng tư.'},503);
 if(!eq(request.headers.get('x-dashboard-key'),required))return json({code:'GA4_UNAUTHORIZED',error:'Cần nhập mã truy cập dashboard đã cấu hình ở Cloudflare.'},401);
 try{
 const url=new URL(request.url),days=Number(url.searchParams.get('days')||30);
 if(![7,30,90].includes(days))return json({code:'INVALID_RANGE',error:'Chỉ hỗ trợ 7, 30 hoặc 90 ngày.'},400);
 const token=await accessToken(env);
 const dateRanges=[{startDate:(days-1)+'daysAgo',endDate:'today'}];
 const common={dateRanges,dimensionFilter:filter,keepEmptyRows:false};
 const [overview,daily,pages,channels,devices,countries,realtime]=await Promise.all([
  report(token,'runReport',{...common,metrics:metricNames.map(name=>({name}))}),
  report(token,'runReport',{...common,dimensions:[{name:'date'}],metrics:[{name:'activeUsers'},{name:'sessions'},{name:'screenPageViews'}],orderBys:[{dimension:{dimensionName:'date'}}],limit:100}),
  report(token,'runReport',{...common,dimensions:[{name:'pageTitle'},{name:'pagePath'}],metrics:[{name:'screenPageViews'},{name:'activeUsers'}],orderBys:[{metric:{metricName:'screenPageViews'},desc:true}],limit:12}),
  report(token,'runReport',{...common,dimensions:[{name:'sessionDefaultChannelGroup'}],metrics:[{name:'sessions'},{name:'activeUsers'}],orderBys:[{metric:{metricName:'sessions'},desc:true}],limit:10}),
  report(token,'runReport',{...common,dimensions:[{name:'deviceCategory'}],metrics:[{name:'sessions'}],limit:10}),
  report(token,'runReport',{...common,dimensions:[{name:'country'}],metrics:[{name:'activeUsers'}],orderBys:[{metric:{metricName:'activeUsers'},desc:true}],limit:10}),
  report(token,'runRealtimeReport',{metrics:[{name:'activeUsers'}],minuteRanges:[{startMinutesAgo:29,endMinutesAgo:0}],dimensionFilter:filter})
 ]);
 return json({status:'connected',source:'Google Analytics Data API',propertyId:PROPERTY,measurementId:'G-Z83BHS8KMY',streamId:STREAM,periodDays:days,updatedAt:new Date().toISOString(),overview:rows(overview)[0]?.metrics||{},realtimeActiveUsers:rows(realtime)[0]?.metrics?.activeUsers||0,daily:rows(daily),pages:rows(pages),channels:rows(channels),devices:rows(devices),countries:rows(countries)});
 }catch(e){return json({status:'error',code:e.code||'GA4_UNAVAILABLE',error:e.message||'Không truy vấn được GA4'},e.status||502);}
}
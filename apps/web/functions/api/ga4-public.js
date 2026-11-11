// Public, aggregate-only GA4 counter for the Blogger Visitor Insights widget.
// Credentials remain on Cloudflare; detailed GA4 dashboard stays protected.
const PROPERTY = '563038949';
const SERVICE_ACCOUNT = 'blognaver-articlepdf@blognaver-automation-article.iam.gserviceaccount.com';
const ALLOWED_ORIGINS = new Set(['https://duynguyen99.blogspot.com']);
const encoder = new TextEncoder();
const b64url = bytes => {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function corsHeaders(origin) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, s-maxage=900',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
    ...(ALLOWED_ORIGINS.has(origin) ? {'Access-Control-Allow-Origin': origin} : {})
  };
}
function reply(body, status, origin) {
  return new Response(JSON.stringify(body), {status, headers: corsHeaders(origin)});
}
async function getToken(raw) {
  if (!raw) throw new Error('GA4_NOT_CONFIGURED');
  let key;
  try {key = JSON.parse(raw);} catch {throw new Error('GA4_CONFIG_INVALID');}
  if (key.type !== 'service_account' || key.client_email !== SERVICE_ACCOUNT || !key.private_key) throw new Error('GA4_CONFIG_INVALID');
  const now = Math.floor(Date.now()/1000);
  const head = b64url(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const payload = b64url(encoder.encode(JSON.stringify({iss:key.client_email, scope:'https://www.googleapis.com/auth/analytics.readonly', aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3000})));
  const der = key.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const bytes = Uint8Array.from(atob(der), c=>c.charCodeAt(0));
  const signingKey = await crypto.subtle.importKey('pkcs8', bytes,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature = b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',signingKey,encoder.encode(head+'.'+payload))));
  const res = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+payload+'.'+signature}),signal:AbortSignal.timeout(12000)});
  if(!res.ok) throw new Error('GA4_TOKEN_FAILED');
  const data = await res.json();
  if(!data.access_token) throw new Error('GA4_TOKEN_FAILED');
  return data.access_token;
}
export async function onRequestGet({request, env, context}) {
  const origin = request.headers.get('Origin') || '';
  // This endpoint is browser-facing only for the known Blogger origin.
  if (!ALLOWED_ORIGINS.has(origin)) return reply({code:'ORIGIN_NOT_ALLOWED'},403,origin);
  const cache = caches.default;
  const cacheKey = new Request('https://ga4-public-cache.internal/visitor-7d');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body,{status:cached.status,headers:corsHeaders(origin)});
  try {
    const token = await getToken(env.GA4_SERVICE_ACCOUNT_JSON);
    const report = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, {
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({dateRanges:[{startDate:'6daysAgo',endDate:'today'}],metrics:[{name:'totalUsers'}],dimensionFilter:{filter:{fieldName:'streamId',stringFilter:{matchType:'EXACT',value:'16289663503'}}}}),
      signal:AbortSignal.timeout(15000)
    });
    if (!report.ok) throw new Error(report.status === 403 ? 'GA4_PERMISSION_DENIED' : 'GA4_REPORT_FAILED');
    const data = await report.json();
    const raw = data.rows?.[0]?.metricValues?.[0]?.value;
    const totalUsers = raw === undefined ? 0 : Number(raw);
    if (!Number.isSafeInteger(totalUsers) || totalUsers < 0) throw new Error('GA4_RESPONSE_INVALID');
    const body={propertyId:PROPERTY,source:'GA4 Data API',totalUsers,periodDays:7,updatedAt:new Date().toISOString()};
    const cachedResponse = new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=300, s-maxage=900'}});
    context.waitUntil(cache.put(cacheKey,cachedResponse.clone()));
    return reply(body,200,origin);
  } catch (error) {
    const code = ['GA4_NOT_CONFIGURED','GA4_CONFIG_INVALID','GA4_TOKEN_FAILED','GA4_PERMISSION_DENIED','GA4_RESPONSE_INVALID'].includes(error.message) ? error.message : 'GA4_REPORT_FAILED';
    return new Response(JSON.stringify({code,error:'Không thể đọc thống kê GA4.'}),{status:503,headers:{...corsHeaders(origin),'Cache-Control':'no-store'}});
  }
}

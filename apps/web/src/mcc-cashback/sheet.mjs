import {parseMccValues} from './model.mjs';
const SHEET_ID='18HueEhTZMv8VErQcQrRR60q1RXjbspAtyysB9PjJTAo';
const SHEET_URL='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/edit';
const te=new TextEncoder();
let cached=null;
const asBytes=pem=>Uint8Array.from(atob(String(pem).replace(/-----[^-]+-----/g,'').replace(/\s+/g,'')),ch=>ch.charCodeAt(0));
const b64=data=>{
  let s='';for(const c of new Uint8Array(data))s+=String.fromCharCode(c);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
export async function readMccDatabase(env,{fetcher=fetch,subtle=crypto.subtle,now=Date.now()}={}) {
  if(cached&&cached.until>now)return {...cached.data,cache:'hit'};
  let service;
  try{service=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||'null')}catch{}
  if(!service?.client_email||!service?.private_key)throw fail('GOOGLE_SERVICE_ACCOUNT_JSON chưa được cấu hình',503);
  const issued=Math.floor(now/1000);
  const header=b64(te.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const body=b64(te.encode(JSON.stringify({iss:service.client_email,
    scope:'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud:'https://oauth2.googleapis.com/token',iat:issued,exp:issued+3600})));
  const key=await subtle.importKey('pkcs8',asBytes(service.private_key),
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=b64(await subtle.sign('RSASSA-PKCS1-v1_5',key,te.encode(header+'.'+body)));
  const auth=await fetcher('https://oauth2.googleapis.com/token',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:header+'.'+body+'.'+sig}),signal:AbortSignal.timeout(12000)});
  if(!auth.ok)throw fail('Không thể xác thực service account: HTTP '+auth.status);
  const token=(await auth.json()).access_token;
  if(!token)throw fail('Google OAuth không cấp token');
  const range=encodeURIComponent("'MCC_Data'!A1:O2000");
  const response=await fetcher('https://sheets.googleapis.com/v4/spreadsheets/'+SHEET_ID+'/values/'+range,
    {headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(16000)});
  if(!response.ok)throw fail('Không đọc được MCC_Data từ Google Sheets (HTTP '+response.status+
    '). Hãy cấp quyền Viewer cho service account.',response.status===403?503:502);
  const data=await response.json();
  const records=parseMccValues(data.values||[]);
  if(!records.length)throw fail('Google Sheets không có bản ghi MCC hợp lệ',422);
  cached={until:now+180000,data:{records,updatedAt:new Date(now).toISOString(),
    source:'google-sheets',sheetUrl:SHEET_URL,total:records.length}};
  return {...cached.data,cache:'miss'};
}

// Server-only Google Sheets reader. Never bundle service-account credentials into the browser.
const SHEET_ID = '19nL6wtouHV-0OumsQR2jF-5xWA1cpbpivRUIsm7hDgk';
const SHEET_RANGE = "'Sheet1'!A1:F5000";
const REQUIRED = ['Việt', 'Hàn', 'Anh', 'Context or Expression', 'Ngữ pháp ví dụ', 'Category'];
const encoder = new TextEncoder();
const b64url = bytes => {
  let out = ''; for (const b of new Uint8Array(bytes)) out += String.fromCharCode(b);
  return btoa(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const pemToBytes = pem => Uint8Array.from(atob(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
let cache = null;
let expires = 0;
let inFlight = null;

export function normalizeVocabulary(values = []) {
  const header = (values[0] || []).map(v => String(v ?? '').trim().toLowerCase());
  const expected = REQUIRED.map(v => v.toLowerCase());
  const indexes = expected.map(v => header.indexOf(v));
  if (indexes.some(x => x < 0)) throw Object.assign(new Error('Google Sheet thiếu một hoặc nhiều cột bắt buộc: ' + REQUIRED.join(', ')), {status: 422});
  return values.slice(1).map((cells, index) => {
    const [vi, ko, en, context, grammar, category] = indexes.map(i => String(cells[i] ?? '').trim());
    return {id: index + 2, vi, ko, en, context, grammar, category: category || 'Chưa phân loại'};
  }).filter(item => item.vi || item.ko || item.en);
}

export async function getVocabularySheet({serviceAccountJson, fetcher = fetch, subtle = crypto.subtle, now = Date.now(), force = false} = {}) {
  if (!serviceAccountJson) throw Object.assign(new Error('Chưa cấu hình GOOGLE_SERVICE_ACCOUNT_JSON trên Cloudflare Pages.'), {status: 503, code: 'SHEETS_SERVICE_ACCOUNT_MISSING'});
  if (!force && cache && now < expires) return {...cache, cache: 'hit'};
  if (!force && inFlight) return inFlight;
  const load = async () => {
    let account;
    try {account = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;}
    catch {throw Object.assign(new Error('GOOGLE_SERVICE_ACCOUNT_JSON không phải JSON hợp lệ.'), {status: 503});}
    if (!account?.client_email || !account?.private_key || !account?.token_uri)
      throw Object.assign(new Error('Service account thiếu client_email, private_key hoặc token_uri.'), {status: 503});
    const issued = Math.floor(now / 1000);
    const header = b64url(encoder.encode(JSON.stringify({alg: 'RS256', typ: 'JWT'})));
    const payload = b64url(encoder.encode(JSON.stringify({
      iss: account.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token', iat: issued, exp: issued + 3600
    })));
    const key = await subtle.importKey('pkcs8', pemToBytes(account.private_key), {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['sign']);
    const signature = b64url(await subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(header + '.' + payload)));
    const token = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: header + '.' + payload + '.' + signature}),
      signal: AbortSignal.timeout(15000)
    });
    if (!token.ok) throw Object.assign(new Error('Google OAuth từ chối service account (HTTP ' + token.status + '). Kiểm tra JSON và quyền chia sẻ Sheet.'), {status: 502, code: 'SHEETS_AUTH_FAILED'});
    const access = (await token.json()).access_token;
    if (!access) throw Object.assign(new Error('Không nhận được access token từ Google.'), {status: 502});
    const sheetUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/' + encodeURIComponent(SHEET_RANGE);
    const response = await fetcher(sheetUrl, {headers: {Authorization: 'Bearer ' + access}, signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw Object.assign(new Error('Không đọc được Sheet (HTTP ' + response.status + '). Kiểm tra quyền Viewer/Editor của service account và tên tab Sheet1.'), {status: 502, code: 'SHEETS_READ_FAILED'});
    const values = (await response.json()).values || [];
    const records = normalizeVocabulary(values);
    const data = {records, total: records.length, source: 'Google Sheets', sheetId: SHEET_ID, syncedAt: new Date(now).toISOString()};
    cache = data; expires = now + 180000;
    return {...data, cache: 'miss'};
  };
  inFlight = load();
  try {return await inFlight;} finally {inFlight = null;}
}

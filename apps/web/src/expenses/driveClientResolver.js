import {resolveDriveClientId} from '../services/driveClientId.js';

export const EDITOR_DRIVE_CLIENT_KEY='dn-editor-drive-client-id';
export const DRIVE_CONFIG_URL='/api/drive-client-config';
const CLIENT_ID_PATTERN=/^[\w-]+\.apps\.googleusercontent\.com$/;
export function validClientId(value) {
  return CLIENT_ID_PATTERN.test(String(value||'').trim());
}

/**
 * Reuses the exact same Web OAuth client as the Editor when possible:
 *   1. Cloudflare/Vite frontend VITE_GOOGLE_CLIENT_ID
 *   2. Existing Editor's remembered public OAuth Client ID (same origin)
 *   3. Backend's public GOOGLE_DRIVE_CLIENT_ID / GOOGLE_CLIENT_ID, read from /api
 * No tokens or Client Secret are returned or stored.
 *
 * This runs on mount, BEFORE the user click that starts Google's GIS popup;
 * async network calls inside an OAuth click callback can get blocked by browsers.
 */
export async function discoverExpenseDriveClientId({
  environmentValue='',
  storedValue='',
  fetcher=(...args)=>fetch(...args)
}={}) {
  const local=resolveDriveClientId(environmentValue,storedValue);
  if(validClientId(local.clientId)) {
    return {
      clientId:local.clientId,
      source:local.configured?'build':'editor',
      error:''
    };
  }
  // A typo in the build variable must not mask a valid Editor-saved ID.
  if(validClientId(storedValue)){
    return {clientId:String(storedValue).trim(),source:'editor',error:''};
  }
  try {
    const response=await fetcher(DRIVE_CONFIG_URL,{
      method:'GET',credentials:'same-origin',
      cache:'no-store',headers:{Accept:'application/json'}
    });
    if(!response.ok)throw new Error('HTTP '+response.status);
    const data=await response.json();
    if(validClientId(data?.clientId)) {
      return {clientId:String(data.clientId).trim(),source:'backend',error:''};
    }
    return {clientId:'',source:'missing',
      error:'Không tìm thấy OAuth Web Client ID trong cấu hình Editor hoặc Cloudflare.'};
  }catch {
    return {clientId:'',source:'missing',
      error:'Không đọc được cấu hình Google OAuth của Editor. Có thể nhập Client ID công khai để kết nối Drive.'};
  }
}

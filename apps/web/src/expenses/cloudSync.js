import {emptyData,normalizeData} from './model.js';

export const CLOUD_SYNC_KEY='dn-daily-expenses-cloud-sync-v1';
export const SYNC_INTERVAL_MS=180_000;

export function snapshotFingerprint(data) {
  return JSON.stringify(normalizeData(data));
}
export function hasUserData(data) {
  return Boolean(data.transactions?.length||data.customCategories?.length||Object.keys(data.budgets||{}).length);
}

/**
 * Never automatically overwrite independently edited snapshots.
 * Conflict requires an explicit user decision + a fresh server revision check.
 */
export function planSync({localData,remote,meta,localMissing=false}) {
  const local=snapshotFingerprint(localData);
  const cloud=remote.exists?snapshotFingerprint(remote.data):snapshotFingerprint(emptyData());
  const owner=String(remote.ownerId||'');
  const sameOwner=meta?.ownerId===owner;

  if(local===cloud)return {action:'equal',local,cloud};
  // Browser storage deletion is not an intentional "erase the cloud" operation.
  if(localMissing&&remote.exists)return {action:'pull',local,cloud};

  if(sameOwner&&meta&&typeof meta.fingerprint==='string'){
    const localChanged=local!==meta.fingerprint;
    const remoteChanged=remote.revision!==meta.revision||cloud!==meta.fingerprint;
    if(localChanged&&remoteChanged)return {action:'conflict',local,cloud};
    if(localChanged)return {action:'push',local,cloud};
    if(remoteChanged)return {action:'pull',local,cloud};
  }
  if(!hasUserData(localData)){
    if(remote.exists)return {action:'pull',local,cloud};
    return {action:'equal',local,cloud};
  }
  if(!remote.exists&&(!meta?.ownerId||sameOwner&&meta.revision===0))
    return {action:'push',local,cloud};
  // Existing local+cloud snapshots with no reliable shared baseline cannot be merged silently.
  return {action:'conflict',local,cloud};
}

export function readSyncMeta(storage) {
  try {
    const meta=JSON.parse(storage.getItem(CLOUD_SYNC_KEY)||'null');
    if(!meta||typeof meta.ownerId!=='string'||!Number.isSafeInteger(meta.revision)||
       meta.revision<0||typeof meta.fingerprint!=='string')return null;
    return meta;
  }catch{return null;}
}
export function persistSyncMeta(storage,ownerId,revision,fingerprint,updatedAt) {
  const meta={ownerId:String(ownerId),revision,fingerprint,lastSyncedAt:updatedAt||new Date().toISOString()};
  storage.setItem(CLOUD_SYNC_KEY,JSON.stringify(meta));
  return meta;
}
export async function requestCloud(path,options={}) {
  let response;
  try {
    response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
  }catch{
    const error=new Error('Không có kết nối mạng hoặc Cloudflare chưa phản hồi. Dữ liệu vẫn lưu trên thiết bị.');
    error.code='EXPENSES_NETWORK';throw error;
  }
  const value=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(String(value.error||'Cloudflare đồng bộ thất bại').slice(0,350));
    error.status=response.status;
    error.code=value.code||'EXPENSES_HTTP_'+response.status;
    throw error;
  }
  return value;
}

import {emptyData,normalizeData} from './model.js';

// This is a NEW metadata key. Old D1 metadata must not trick Drive into being "synced".
export const DRIVE_SYNC_KEY='dn-daily-expenses-drive-sync-v1';
export const SYNC_INTERVAL_MS=180_000;
export const SHORT_SYNC_DELAY_MS=12_000;

export function snapshotFingerprint(data) {
  return JSON.stringify(normalizeData(data));
}
export function hasUserData(data) {
  return Boolean(data.transactions?.length||data.customCategories?.length||Object.keys(data.budgets||{}).length);
}
export function readDriveSyncMeta(storage) {
  try {
    const v=JSON.parse(storage.getItem(DRIVE_SYNC_KEY)||'null');
    if(!v||typeof v.ownerId!=='string'||!v.ownerId||typeof v.fingerprint!=='string'||typeof v.fileId!=='string')
      return null;
    return v;
  }catch{return null;}
}
export function writeDriveSyncMeta(storage,remote,fingerprint) {
  const meta={
    ownerId:String(remote.ownerId),fileId:String(remote.snapshotId||''),
    fingerprint,lastSyncedAt:remote.updatedAt||new Date().toISOString()
  };
  storage.setItem(DRIVE_SYNC_KEY,JSON.stringify(meta));
  return meta;
}
/**
 * No blind overwrite, including when the browser still has stale D1 sync metadata.
 * Drive files are append-only. A new JSON snapshot is created only for actual changes.
 */
export function planDriveSync({localData,localMissing=false,remote,meta}) {
  const local=snapshotFingerprint(localData);
  const cloud=remote.exists?snapshotFingerprint(remote.data):snapshotFingerprint(emptyData());
  const sameAccount=meta?.ownerId===remote.ownerId;
  if(meta&&!sameAccount&&hasUserData(localData))
    return {action:'conflict',local,cloud};
  if(local===cloud)return {action:'equal',local,cloud};
  if(localMissing&&remote.exists)return {action:'pull',local,cloud};
  if(meta&&!sameAccount){
    if(!hasUserData(localData)&&remote.exists)return {action:'pull',local,cloud};
    return {action:'conflict',local,cloud};
  }
  if(meta&&sameAccount){
    // An unrelated Drive snapshot can be a concurrent branch; do not silently
    // replace an acknowledged local snapshot with a different branch head.
    if(remote.exists&&meta.fileId&&remote.snapshotId!==meta.fileId&&
       (!Array.isArray(remote.ancestorIds)||!remote.ancestorIds.includes(meta.fileId)))
      return {action:'conflict',local,cloud};
    const localChanged=local!==meta.fingerprint;
    const remoteChanged=String(remote.snapshotId||'')!==meta.fileId||cloud!==meta.fingerprint;
    if(localChanged&&remoteChanged)return {action:'conflict',local,cloud};
    if(localChanged)return {action:'push',local,cloud};
    if(remoteChanged)return {action:'pull',local,cloud};
  }
  if(!hasUserData(localData)){
    if(remote.exists)return {action:'pull',local,cloud};
    return {action:'equal',local,cloud};
  }
  if(!remote.exists&&!meta)return {action:'push',local,cloud};
  // Both sides have data but have no common, verified sync baseline.
  return {action:'conflict',local,cloud};
}

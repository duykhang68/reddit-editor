import {normalizeTransaction,todayVietnam,validDate} from './model.js';

export const emptyData=()=>({transactions:[],config:{
  cycleStart:todayVietnam(),tier:'gold',membershipAdjustment:0,rewardsAdjustment:0,redeemed:0
}});
export function normalizeData(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Backup Highlands không đúng cấu trúc.');
  if(data.transactions!==undefined&&!Array.isArray(data.transactions))throw new Error('Danh sách giao dịch Highlands không hợp lệ.');
  if((data.transactions||[]).length>20000)throw new Error('Giới hạn 20.000 giao dịch cho một bản sao.');
  const transactions=(data.transactions||[]).map(normalizeTransaction);
  const ids=new Set();
  for(const tx of transactions){
    if(!tx.id||ids.has(tx.id))throw new Error('Backup có mã giao dịch thiếu hoặc trùng.');
    ids.add(tx.id);
  }
  const defaults=emptyData().config;
  const given=data.config&&typeof data.config==='object'&&!Array.isArray(data.config)?data.config:{};
  const config={
    cycleStart:validDate(given.cycleStart)?given.cycleStart:defaults.cycleStart,
    tier:['gold','platinum','black'].includes(given.tier)?given.tier:'gold',
    membershipAdjustment:Number.isFinite(Number(given.membershipAdjustment))?Number(given.membershipAdjustment):0,
    rewardsAdjustment:Number.isFinite(Number(given.rewardsAdjustment))?Number(given.rewardsAdjustment):0,
    redeemed:Number.isFinite(Number(given.redeemed))&&Number(given.redeemed)>=0?Number(given.redeemed):0,
    stampsRedeemed:Number.isFinite(Number(given.stampsRedeemed))&&Number(given.stampsRedeemed)>=0?Number(given.stampsRedeemed):0
  };
  return {transactions,config};
}

// This is a NEW metadata key. Old D1 metadata must not trick Drive into being "synced".
export const DRIVE_SYNC_KEY='dn-highlands-drive-sync-v1';
export const SYNC_INTERVAL_MS=180_000;
export const SHORT_SYNC_DELAY_MS=12_000;

export function snapshotFingerprint(data) {
  return JSON.stringify(normalizeData(data));
}
export function hasUserData(data) {
  return Boolean(data.transactions?.length||(data.config?.cycleStart&&data.config.cycleStart!==todayVietnam())||data.config?.tier!=='gold'||Number(data.config?.membershipAdjustment)||Number(data.config?.rewardsAdjustment)||Number(data.config?.redeemed)||Number(data.config?.stampsRedeemed));
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

import {useCallback,useEffect,useRef,useState} from 'react';
import {STORAGE_KEY,emptyData,normalizeData} from './model.js';
import {
  CLOUD_SYNC_KEY,SYNC_INTERVAL_MS,planSync,persistSyncMeta,readSyncMeta,requestCloud,snapshotFingerprint
} from './cloudSync.js';

const initial={status:'checking',message:'Đang kiểm tra lưu trữ Cloudflare',lastSyncedAt:null};
function readLocal() {
  const raw=localStorage.getItem(STORAGE_KEY);
  try{return {raw,data:raw?normalizeData(JSON.parse(raw)):emptyData(),invalid:false};}
  catch{return {raw,data:emptyData(),invalid:true};}
}
function backupSnapshot(data,name) {
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function snapshotStillCurrent(raw) {
  return localStorage.getItem(STORAGE_KEY)===raw;
}
const messageFor=error=>error?.code==='EXPENSES_DB_MISSING'
  ?'Chưa liên kết Cloudflare D1 (EXPENSES_DB). Dữ liệu vẫn lưu trên thiết bị.'
  :error?.message||'Không thể đồng bộ lúc này. Dữ liệu vẫn được lưu cục bộ.';

/** Mirrors browser-local state to one owner-scoped Cloudflare D1 snapshot. */
export function useExpenseCloudSync(data,setData) {
  const [sync,setSync]=useState(initial);
  const [conflict,setConflict]=useState(null);
  const busy=useRef(false);
  const csrf=useRef('');

  const synchronize=useCallback(async ()=>{
    if(busy.current)return;
    busy.current=true;
    setSync(current=>({...current,status:'syncing',message:'Đang kiểm tra và đồng bộ Cloudflare…'}));
    try{
      const auth=await requestCloud('/api/status');
      if(!auth.connected){
        csrf.current='';
        setConflict(null);
        setSync(current=>({...current,status:'auth',message:'Đăng nhập Google để bật sao lưu Cloudflare tự động.'}));
        return;
      }
      csrf.current=auth.csrf||'';
      const original=readLocal();
      if(original.invalid){setSync(s=>({...s,status:'error',message:'Dữ liệu local không hợp lệ. Không tự đồng bộ để tránh mất dữ liệu.'}));return;}
      const remote=await requestCloud('/api/expenses-state');
      const meta=readSyncMeta(localStorage);
      const plan=planSync({localData:original.data,remote,meta,localMissing:original.raw===null});

      // Local edits can happen while the GET is in flight. Never overwrite them.
      if(!snapshotStillCurrent(original.raw)){
        setSync(current=>({...current,status:'pending',message:'Đã có thay đổi mới; đang chờ lượt đồng bộ tiếp theo.'}));
        return;
      }
      if(plan.action==='conflict'){
        setConflict({remote,raw:original.raw});
        setSync(current=>({...current,status:'conflict',message:'Dữ liệu cloud và thiết bị đã khác nhau. Cần chọn cách xử lý; chưa ghi đè bên nào.'}));
        return;
      }
      setConflict(null);
      if(plan.action==='pull'){
        localStorage.setItem(STORAGE_KEY,plan.cloud);
        persistSyncMeta(localStorage,remote.ownerId,remote.revision,plan.cloud,remote.updatedAt);
        setData(normalizeData(remote.data));
        setSync({status:'synced',message:'Đã khôi phục bản lưu trên Cloudflare.',lastSyncedAt:remote.updatedAt});
        return;
      }
      if(plan.action==='push'){
        const result=await requestCloud('/api/expenses-state',{
          method:'PUT',
          headers:{'Content-Type':'application/json','X-CSRF-Token':csrf.current},
          body:JSON.stringify({expectedRevision:remote.revision,data:original.data})
        });
        persistSyncMeta(localStorage,remote.ownerId,result.revision,plan.local,result.updatedAt);
        const changed=!snapshotStillCurrent(original.raw);
        setSync({status:changed?'pending':'synced',
          message:changed?'Có chỉnh sửa mới sau khi sao lưu; sẽ đồng bộ lượt tiếp theo.':'Đã lưu và xác nhận trên Cloudflare.',
          lastSyncedAt:result.updatedAt});
        return;
      }
      // Equal includes an empty account; there is no payload to upload yet.
      const stamp=remote.updatedAt||new Date().toISOString();
      persistSyncMeta(localStorage,remote.ownerId,remote.revision,plan.local,stamp);
      setSync({status:remote.exists?'synced':'ready',message:remote.exists?'Dữ liệu trên thiết bị khớp với Cloudflare.':'Cloudflare đã kết nối; chưa có giao dịch để sao lưu.',lastSyncedAt:remote.updatedAt});
    }catch(error){
      if(error.status===409){
        // A second device won an optimistic transaction. Re-read before showing a conflict.
        try {
          const current=readLocal();
          const remote=await requestCloud('/api/expenses-state');
          if(snapshotFingerprint(current.data)===snapshotFingerprint(remote.data||emptyData())){
            persistSyncMeta(localStorage,remote.ownerId,remote.revision,snapshotFingerprint(current.data),remote.updatedAt);
            setConflict(null);
            setSync({status:'synced',message:'Các thiết bị đã có cùng dữ liệu.',lastSyncedAt:remote.updatedAt});
          }else{
            setConflict({remote,raw:current.raw});
            setSync(currentState=>({...currentState,status:'conflict',message:'Cloudflare đã được chỉnh sửa từ nơi khác. Chọn cách xử lý xung đột.'}));
          }
        }catch(secondError){
          setSync(current=>({...current,status:'error',message:messageFor(secondError)}));
        }
      }else{
        const status=error.status===401?'auth':error.code==='EXPENSES_DB_MISSING'?'unconfigured':'error';
        setSync(current=>({...current,status,message:messageFor(error)}));
      }
    }finally{busy.current=false;}
  },[setData]);

  useEffect(()=>{
    void synchronize();
    const id=setInterval(()=>void synchronize(),SYNC_INTERVAL_MS);
    const resume=()=>{if(document.visibilityState==='visible')void synchronize();};
    const online=()=>void synchronize();
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('online',online);
    return ()=>{
      clearInterval(id);
      document.removeEventListener('visibilitychange',resume);
      window.removeEventListener('online',online);
    };
  },[synchronize]);

  // Small debounce after a local edit, in addition to the required 3-minute cycle.
  // This shortens the at-risk window if the tab is closed soon after data entry.
  useEffect(()=>{
    const current=readLocal();
    const meta=readSyncMeta(localStorage);
    if(meta?.fingerprint===snapshotFingerprint(current.data))return;
    setSync(s=>['conflict','unconfigured','auth'].includes(s.status)?s:{...s,status:'pending',message:'Thay đổi mới đã lưu tại máy; chuẩn bị sao lưu cloud.'});
    const timeout=setTimeout(()=>void synchronize(),12_000);
    return ()=>clearTimeout(timeout);
  },[data,synchronize]);

  // Multi-tab events: read remote localStorage edits instead of silently dropping them.
  useEffect(()=>{
    const changed=event=>{
      if(event.key===STORAGE_KEY){
        try{setData(event.newValue?normalizeData(JSON.parse(event.newValue)):emptyData());}
        catch{setSync(s=>({...s,status:'error',message:'Bản local từ tab khác không hợp lệ. Không ghi đè.'}));}
      }
      if(event.key===CLOUD_SYNC_KEY){
        setSync(s=>s.status==='synced'?{...s,status:'pending',message:'Thông tin đồng bộ đã thay đổi ở một tab khác.'}:s);
      }
    };
    window.addEventListener('storage',changed);
    return ()=>window.removeEventListener('storage',changed);
  },[setData]);

  const resolveConflict=useCallback(async choice=>{
    if(!conflict||busy.current)return;
    const {remote,raw}=conflict;
    if(!snapshotStillCurrent(raw)){
      setSync(current=>({...current,status:'pending',message:'Dữ liệu local mới thay đổi. Hãy bấm Đồng bộ ngay để kiểm tra lại.'}));
      setConflict(null);
      return;
    }
    if(choice==='cloud'){
      if(!window.confirm('Bản local chưa đồng bộ sẽ được tải xuống thành JSON dự phòng trước khi thay bằng bản Cloudflare. Tiếp tục?'))return;
      backupSnapshot(readLocal().data,'expenses-local-before-cloud-restore.json');
      try{
        const fresh=await requestCloud('/api/expenses-state');
        if(fresh.ownerId!==remote.ownerId||fresh.revision!==remote.revision)
          throw Object.assign(new Error('Bản Cloudflare đã thay đổi. Chưa khôi phục; hãy đồng bộ lại.'),{status:409});
        if(!snapshotStillCurrent(raw))
          throw Object.assign(new Error('Bản local vừa thay đổi. Chưa khôi phục; hãy đồng bộ lại.'),{status:409});
        const canonical=snapshotFingerprint(remote.data||emptyData());
        localStorage.setItem(STORAGE_KEY,canonical);
        persistSyncMeta(localStorage,remote.ownerId,remote.revision,canonical,remote.updatedAt);
        setData(normalizeData(remote.data||emptyData()));
        setConflict(null);
        setSync({status:'synced',message:'Đã khôi phục dữ liệu cloud, kèm backup bản local.',lastSyncedAt:remote.updatedAt});
      }catch(error){setSync(current=>({...current,status:'error',message:messageFor(error)}));}
      return;
    }
    if(choice==='local'){
      if(!window.confirm('Bản cloud hiện tại sẽ được tải xuống thành JSON dự phòng. Sau đó sẽ GHI ĐÈ cloud bằng dữ liệu trên thiết bị này. Bạn xác nhận?'))return;
      backupSnapshot(remote.data||emptyData(),'expenses-cloud-before-overwrite.json');
      busy.current=true;
      setSync(s=>({...s,status:'syncing',message:'Đang ghi bản local đã được xác nhận lên cloud…'}));
      try{
        const auth=await requestCloud('/api/status');
        if(!auth.connected)throw Object.assign(new Error('Cần đăng nhập Google lại.'),{status:401});
        const currentCloud=await requestCloud('/api/expenses-state');
        if(currentCloud.ownerId!==remote.ownerId||currentCloud.revision!==remote.revision)
          throw Object.assign(new Error('Bản cloud đã đổi trong lúc xác nhận. Không ghi đè.'),{status:409});
        const localBefore=readLocal();
        if(localBefore.raw!==raw)
          throw Object.assign(new Error('Bản local đã đổi trong lúc xác nhận. Không ghi đè.'),{status:409});
        const result=await requestCloud('/api/expenses-state',{method:'PUT',
          headers:{'Content-Type':'application/json','X-CSRF-Token':auth.csrf},
          body:JSON.stringify({expectedRevision:remote.revision,data:localBefore.data})
        });
        const fp=snapshotFingerprint(localBefore.data);
        persistSyncMeta(localStorage,remote.ownerId,result.revision,fp,result.updatedAt);
        const changed=!snapshotStillCurrent(localBefore.raw);
        setConflict(null);
        setSync({status:changed?'pending':'synced',message:changed?'Có thay đổi local mới; đang chờ đồng bộ tiếp.':'Đã cập nhật bản cloud theo xác nhận của bạn.',lastSyncedAt:result.updatedAt});
      }catch(error){
        setConflict(null);
        setSync(s=>({...s,status:error.status===409?'pending':'error',message:messageFor(error)+' Hãy đồng bộ lại để lấy phiên bản mới nhất.'}));
      }finally{busy.current=false;}
    }
  },[conflict,setData]);

  return {sync,conflict,synchronize,resolveConflict};
}

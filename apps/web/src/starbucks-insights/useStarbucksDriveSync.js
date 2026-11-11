import {useCallback,useEffect,useRef,useState} from 'react';
import {STORAGE_KEY} from './model.js';
import {emptyData,normalizeData} from './driveSync.js';
import {DRIVE_SYNC_KEY,SYNC_INTERVAL_MS,SHORT_SYNC_DELAY_MS,
  planDriveSync,readDriveSyncMeta,snapshotFingerprint,writeDriveSyncMeta,hasUserData} from './driveSync.js';
import {googleDrive} from '../services/googleDriveService.js';
import {discoverExpenseDriveClientId,validClientId,EDITOR_DRIVE_CLIENT_KEY} from '../expenses/driveClientResolver.js';

const firstState={status:'disconnected',message:'Kết nối Google Drive để bật sao lưu tự động.',lastSyncedAt:null,snapshotId:''};
const sameStorage=raw=>localStorage.getItem(STORAGE_KEY)===raw;
function readLocal() {
  const raw=localStorage.getItem(STORAGE_KEY);
  try{return {raw,invalid:false,data:raw?normalizeData(JSON.parse(raw)):emptyData()};}
  catch {return {raw,invalid:true,data:null};}
}
function backupFile(data,name){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const safeStatus=error=>!googleDrive.connected()?'disconnected':error?.status===409?'conflict':'error';
const errorText=error=>String(error?.message||'Google Drive không phản hồi. Dữ liệu local vẫn được giữ.');

/**
 * Cloud storage is Drive (drive.file scope), NOT Cloudflare D1.
 * All tokens stay in memory in the shared Editor Drive service.
 * The timer runs only while the web page is alive and the Drive token remains valid.
 */
export function useStarbucksDriveSync(data,setData) {
  const [sync,setSync]=useState(firstState);
  const [conflict,setConflict]=useState(null);
  const [connected,setConnected]=useState(googleDrive.connected());
  const busy=useRef(false);
  const connecting=useRef(false);
  const [clientConfig,setClientConfig]=useState({
    clientId:'',source:'loading',loading:true,showInput:false
  });

  // Resolve public OAuth configuration before the Google sign-in click, so the
  // GIS popup is not blocked by async calls after user activation.
  useEffect(()=>{
    let active=true;
    const saved=(()=>{try{return localStorage.getItem(EDITOR_DRIVE_CLIENT_KEY)||'';}catch{return '';}})();
    void discoverExpenseDriveClientId({
      environmentValue:import.meta.env.VITE_GOOGLE_CLIENT_ID,storedValue:saved
    }).then(result=>{
      if(!active)return;
      setClientConfig({
        clientId:result.clientId,source:result.source,
        loading:false,showInput:!result.clientId
      });
      if(!result.clientId){
        setSync(state=>({...state,status:'unconfigured',message:result.error}));
      }
    });
    return ()=>{active=false;};
  },[]);

  const setManualClientId=useCallback(value=>{
    setClientConfig(current=>({
      ...current,clientId:value,source:'manual',showInput:true
    }));
  },[]);
  const toggleClientIdInput=useCallback(()=>{
    setClientConfig(current=>({...current,showInput:!current.showInput}));
  },[]);

  const syncNow=useCallback(async ()=>{
    if(busy.current)return;
    if(!googleDrive.connected()){
      setConnected(false);
      setSync(s=>({...s,status:'disconnected',message:'Phiên Drive chưa kết nối hoặc đã hết hạn. Nhấn Kết nối Drive.'}));
      return;
    }
    busy.current=true;
    setSync(s=>({...s,status:'syncing',message:'Đang đối chiếu và sao lưu Google Drive…'}));
    try{
      const local=readLocal();
      if(local.invalid)throw new Error('Dữ liệu lưu trên trình duyệt không hợp lệ. Không ghi đè hay upload bản rỗng.');
      const remote=await googleDrive.readStarbucksState();
      const meta=readDriveSyncMeta(localStorage);
      const plan=planDriveSync({localData:local.data,localMissing:local.raw===null,remote,meta});
      if(!sameStorage(local.raw)){
        setSync(s=>({...s,status:'pending',message:'Có dữ liệu local mới trong lúc kiểm tra. Sẽ đồng bộ lượt tiếp theo.'}));
        return;
      }
      if(plan.action==='conflict'){
        setConflict({remote,localRaw:local.raw});
        setSync(s=>({...s,status:'conflict',message:'Bản Drive và bản trên thiết bị khác nhau. Không tự ghi đè.'}));
        return;
      }
      setConflict(null);
      if(plan.action==='pull'){
        // Revalidate head to avoid installing an older remote read over a fresh one.
        const newest=await googleDrive.readStarbucksState();
        if(newest.snapshotId!==remote.snapshotId||newest.ownerId!==remote.ownerId||!sameStorage(local.raw)){
          setSync(s=>({...s,status:'pending',message:'Drive hoặc thiết bị vừa thay đổi. Bấm Đồng bộ ngay để kiểm tra lại.'}));
          return;
        }
        const normalized=normalizeData(newest.data);
        const fingerprint=snapshotFingerprint(normalized);
        localStorage.setItem(STORAGE_KEY,fingerprint);
        writeDriveSyncMeta(localStorage,newest,fingerprint);
        setData(normalized);
        setSync({status:'synced',message:'Đã khôi phục bản dữ liệu mới nhất từ Google Drive.',
          lastSyncedAt:newest.updatedAt,snapshotId:newest.snapshotId});
        return;
      }
      if(plan.action==='push'){
        const saved=await googleDrive.saveStarbucksSnapshot(local.data,remote.snapshotId||'');
        // The Google API read-back is performed before saveStarbucksSnapshot resolves.
        writeDriveSyncMeta(localStorage,saved,plan.local);
        const newer=!sameStorage(local.raw);
        setSync({status:newer?'pending':'synced',
          message:newer?'Đã sao lưu phiên bản trước; có thay đổi mới chưa đồng bộ.':'Google Drive đã xác nhận bản sao JSON mới.',
          lastSyncedAt:saved.updatedAt,snapshotId:saved.snapshotId});
        return;
      }
      if(remote.exists){
        writeDriveSyncMeta(localStorage,remote,plan.local);
        setSync({status:'synced',message:'Dữ liệu trên máy khớp bản sao Google Drive.',
          lastSyncedAt:remote.updatedAt,snapshotId:remote.snapshotId});
      }else{
        setSync({status:'ready',message:'Đã kết nối Google Drive. Chưa có giao dịch để sao lưu.',
          lastSyncedAt:null,snapshotId:''});
      }
    }catch(error){
      if(error.status===409||error.code==='STARBUCKS_CONFLICT'){
        try{
          const local=readLocal();
          const remote=await googleDrive.readStarbucksState();
          if(!local.invalid && remote.exists && snapshotFingerprint(local.data)===snapshotFingerprint(remote.data)){
            writeDriveSyncMeta(localStorage,remote,snapshotFingerprint(local.data));
            setConflict(null);
            setSync({status:'synced',message:'Hai thiết bị đã có cùng dữ liệu.',
              lastSyncedAt:remote.updatedAt,snapshotId:remote.snapshotId});
          }else{
            setConflict({remote,localRaw:local.raw});
            setSync(s=>({...s,status:'conflict',message:'Google Drive đã có thay đổi khác. Hãy chọn bản cần giữ.'}));
          }
        }catch(second){
          setSync(s=>({...s,status:safeStatus(second),message:errorText(second)}));
        }
      }else{
        setSync(s=>({...s,status:safeStatus(error),message:errorText(error)}));
      }
    }finally{
      busy.current=false;
      setConnected(googleDrive.connected());
    }
  },[setData]);

  const connect=useCallback(async ()=>{
    if(busy.current||connecting.current)return;
    if(clientConfig.loading){
      setSync(s=>({...s,status:'checking',message:'Đang lấy OAuth Client ID từ cấu hình Editor…'}));
      return;
    }
    const clientId=String(clientConfig.clientId||'').trim();
    if(!validClientId(clientId)){
      setClientConfig(s=>({...s,showInput:true}));
      setSync(s=>({...s,status:'unconfigured',
        message:'Không tìm được OAuth Client ID hợp lệ. Nhập Web Client ID trong ô bên dưới, hoặc cấu hình VITE_GOOGLE_CLIENT_ID.'}));
      return;
    }
    connecting.current=true;
    try{
      setSync(s=>({...s,status:'connecting',message:'Đang mở đăng nhập Google Drive…'}));
      await googleDrive.login(clientId);
      if(clientConfig.source==='manual'){
        // Client ID is public and shared with Editor. OAuth tokens stay in RAM.
        try{localStorage.setItem(EDITOR_DRIVE_CLIENT_KEY,clientId);}catch{}
      }
      setConnected(true);
      await syncNow();
    }catch(error){
      setConnected(googleDrive.connected());
      setClientConfig(s=>({...s,showInput:true}));
      setSync(s=>({...s,status:'error',
        message:errorText(error)+' Kiểm tra Web Client ID và Authorized JavaScript Origins.'}));
    }finally{connecting.current=false;}
  },[clientConfig,syncNow]);

  // On reload we don't pretend the Editor's in-memory token survived navigation.
  useEffect(()=>{
    if(googleDrive.connected())void syncNow();
    const id=setInterval(()=>{
      if(googleDrive.connected())void syncNow();
      else setConnected(false);
    },SYNC_INTERVAL_MS);
    const wake=()=>{
      if(document.visibilityState==='visible'){
        if(googleDrive.connected())void syncNow();
        else setConnected(false);
      }
    };
    const online=()=>{if(googleDrive.connected())void syncNow();};
    document.addEventListener('visibilitychange',wake);
    window.addEventListener('online',online);
    return ()=>{
      clearInterval(id);
      document.removeEventListener('visibilitychange',wake);
      window.removeEventListener('online',online);
    };
  },[syncNow]);

  useEffect(()=>{
    const local=readLocal();
    if(local.invalid)return;
    const meta=readDriveSyncMeta(localStorage);
    if(meta?.fingerprint===snapshotFingerprint(local.data)||!hasUserData(local.data))return;
    setSync(s=>s.status==='conflict'?s:{...s,status:googleDrive.connected()?'pending':'disconnected',
      message:googleDrive.connected()?'Thay đổi đã lưu trên máy; sắp sao lưu Google Drive.':'Đã lưu trên máy. Kết nối Drive để sao lưu.'});
    if(!googleDrive.connected())return;
    const timer=setTimeout(()=>void syncNow(),SHORT_SYNC_DELAY_MS);
    return ()=>clearTimeout(timer);
  },[data,syncNow]);

  useEffect(()=>{
    const onStorage=event=>{
      if(event.key===STORAGE_KEY){
        try {setData(event.newValue?normalizeData(JSON.parse(event.newValue)):emptyData());}
        catch {setSync(s=>({...s,status:'error',message:'Tab khác ghi dữ liệu không hợp lệ. Không ghi đè.'}));}
      }
      if(event.key===DRIVE_SYNC_KEY&&googleDrive.connected())void syncNow();
    };
    window.addEventListener('storage',onStorage);
    return ()=>window.removeEventListener('storage',onStorage);
  },[setData,syncNow]);

  const resolveConflict=useCallback(async choice=>{
    if(!conflict||busy.current||!googleDrive.connected())return;
    const {remote,localRaw}=conflict;
    if(!sameStorage(localRaw)){
      setConflict(null);
      setSync(s=>({...s,status:'pending',message:'Dữ liệu local đã thay đổi. Đồng bộ lại trước khi chọn.'}));
      return;
    }
    if(choice==='drive'){
      if(!window.confirm('Xuất JSON dự phòng của bản local, sau đó khôi phục bản mới nhất từ Google Drive?'))return;
      backupFile(readLocal().data,'starbucks-local-before-drive-restore.json');
      busy.current=true;
      try{
        const fresh=await googleDrive.readStarbucksState();
        if(fresh.ownerId!==remote.ownerId||fresh.snapshotId!==remote.snapshotId||!sameStorage(localRaw))
          throw new Error('Drive hoặc local vừa thay đổi. Hãy kiểm tra lại; chưa ghi đè.');
        const fingerprint=snapshotFingerprint(fresh.data||emptyData());
        localStorage.setItem(STORAGE_KEY,fingerprint);
        writeDriveSyncMeta(localStorage,fresh,fingerprint);
        setData(normalizeData(fresh.data||emptyData()));
        setConflict(null);
        setSync({status:'synced',message:'Đã khôi phục Drive và sao lưu bản local thành JSON.',
          lastSyncedAt:fresh.updatedAt,snapshotId:fresh.snapshotId});
      }catch(error){setSync(s=>({...s,status:'error',message:errorText(error)}));}
      finally{busy.current=false;}
      return;
    }
    if(choice==='local'){
      if(!window.confirm('Xuất bản Drive hiện tại thành JSON dự phòng, sau đó tạo bản sao JSON MỚI trên Drive bằng dữ liệu local?'))return;
      backupFile(remote.data||emptyData(),'starbucks-drive-before-local-upload.json');
      busy.current=true;
      setSync(s=>({...s,status:'syncing',message:'Đang tạo bản sao Drive mới; bản cũ vẫn được giữ.'}));
      try{
        const latest=await googleDrive.readStarbucksState();
        if(latest.ownerId!==remote.ownerId||latest.snapshotId!==remote.snapshotId||!sameStorage(localRaw))
          throw new Error('Drive hoặc local vừa thay đổi; không upload để tránh xung đột.');
        const snapshot=readLocal();
        if(snapshot.invalid)throw new Error('Dữ liệu local không hợp lệ.');
        const saved=await googleDrive.saveStarbucksSnapshot(snapshot.data,remote.snapshotId||'');
        const fingerprint=snapshotFingerprint(snapshot.data);
        writeDriveSyncMeta(localStorage,saved,fingerprint);
        const newer=!sameStorage(snapshot.raw);
        setConflict(null);
        setSync({status:newer?'pending':'synced',message:newer?'Bản Drive mới đã lưu; còn thay đổi local khác.':'Đã lưu bản mới trên Drive; bản cũ không bị xóa.',
          lastSyncedAt:saved.updatedAt,snapshotId:saved.snapshotId});
      }catch(error){
        setSync(s=>({...s,status:safeStatus(error),message:errorText(error)+' Hãy Đồng bộ ngay để kiểm tra lại.'}));
      }finally{busy.current=false;}
    }
  },[conflict,setData]);

  return {sync,conflict,connected,connect,synchronize:syncNow,resolveConflict,
    clientConfig,setManualClientId,toggleClientIdInput};
}

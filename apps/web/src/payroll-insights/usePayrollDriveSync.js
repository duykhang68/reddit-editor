import {useCallback,useEffect,useRef,useState} from 'react';
import {googleDrive} from '../services/googleDriveService.js';
import {discoverExpenseDriveClientId,EDITOR_DRIVE_CLIENT_KEY,validClientId} from '../expenses/driveClientResolver.js';
import {encryptPayrollData,decryptPayrollData,payrollFingerprint} from './driveCrypto.js';

const WAIT_MS=180000,AFTER_CHANGE_MS=12000;
const initial={status:'disconnected',message:'Sao lưu Drive được tắt theo mặc định. Chỉ mã hóa và đồng bộ sau khi bạn bật.',lastSyncedAt:null,snapshotId:''};
export function usePayrollDriveSync(data,onRestore){
 const [state,setState]=useState(initial),[enabled,setEnabled]=useState(false);
 const [remoteExists,setRemoteExists]=useState(false),[config,setConfig]=useState({clientId:'',loading:true,showInput:false});
 const password=useRef(''),headId=useRef(null),lastHash=useRef(null),busy=useRef(false),latest=useRef(data);
 latest.current=data;
 useEffect(()=>{
  let alive=true;
  const stored=(()=>{try{return localStorage.getItem(EDITOR_DRIVE_CLIENT_KEY)||'';}catch{return '';}})();
  void discoverExpenseDriveClientId({environmentValue:import.meta.env.VITE_GOOGLE_CLIENT_ID,
   storedValue:stored}).then(result=>{
    if(!alive)return;
    setConfig({clientId:result.clientId||'',loading:false,showInput:!result.clientId});
  }).catch(()=>{if(alive)setConfig(c=>({...c,loading:false,showInput:true}));});
  return ()=>{alive=false;password.current='';};
 },[]);
 const setClientId=value=>setConfig(c=>({...c,clientId:value,showInput:true}));
 const connect=useCallback(async passphrase=>{
  if(busy.current)return;
  if(typeof passphrase!=='string'||passphrase.length<12){
   setState(s=>({...s,status:'error',message:'Nhập mật khẩu mã hóa từ 12 ký tự. Mật khẩu không lưu và không gửi lên Google.'}));return;
  }
  if(config.loading||!validClientId(config.clientId)){
   setConfig(c=>({...c,showInput:true}));
   setState(s=>({...s,status:'error',message:'Thiếu OAuth Web Client ID. Hãy cấu hình VITE_GOOGLE_CLIENT_ID như Editor hoặc nhập Client ID.'}));return;
  }
  busy.current=true;setState(s=>({...s,status:'connecting',message:'Đang kết nối Drive và kiểm tra bản sao đã mã hóa…'}));
  try{
   if(!googleDrive.connected())await googleDrive.login(config.clientId);
   const remote=await googleDrive.readPayrollState();
   password.current=passphrase;setEnabled(true);
   if(remote.exists){
    setRemoteExists(true);headId.current=null;
    setState({status:'conflict',message:'Drive đã có bản sao Payroll mã hóa. Chọn KHÔI PHỤC hoặc SAO LƯU BẢN HIỆN TẠI; không tự ghi đè.',lastSyncedAt:remote.updatedAt,snapshotId:remote.snapshotId});
   }else{
    setRemoteExists(false);headId.current='';lastHash.current=null;
    setState({status:'ready',message:'Drive đã kết nối; chỉ upload JSON dữ liệu phân tích được mã hóa AES-256. Không upload PDF gốc.',lastSyncedAt:null,snapshotId:''});
   }
  }catch(err){password.current='';setEnabled(false);setState(s=>({...s,status:'error',message:String(err?.message||err)}));}
  finally{busy.current=false;}
 },[config]);
 const save=useCallback(async({force=false}={})=>{
  if(!enabled||busy.current||!googleDrive.connected()||headId.current===null)return;
  const snapshot=latest.current;
  if(!snapshot?.rows?.length)return;
  busy.current=true;
  try{
   const hash=await payrollFingerprint(snapshot);
   if(!force&&hash===lastHash.current)return;
   setState(s=>({...s,status:'syncing',message:'Đang mã hóa trên thiết bị và kiểm tra xung đột Drive…'}));
   const remote=await googleDrive.readPayrollState();
   if(String(remote.snapshotId||'')!==String(headId.current||'')){
    headId.current=null;setRemoteExists(true);
    setState(s=>({...s,status:'conflict',message:'Drive vừa thay đổi ở nơi khác. Không upload tự động. Hãy chọn hướng xử lý trước khi đồng bộ.'}));
    return;
   }
   const encrypted=await encryptPayrollData(snapshot,password.current);
   // Only the encrypted object reaches the service.
   const saved=await googleDrive.savePayrollEncryptedSnapshot(encrypted,remote.snapshotId||'');
   headId.current=saved.snapshotId;lastHash.current=hash;setRemoteExists(true);
   const changed=await payrollFingerprint(latest.current)!==hash;
   setState({status:changed?'pending':'synced',
    message:changed?'Đã sao lưu bản trước. Có chỉnh sửa mới cần đồng bộ tiếp.':'Drive xác nhận bản sao Payroll đã mã hóa; PDF gốc không được upload.',
    lastSyncedAt:saved.updatedAt,snapshotId:saved.snapshotId});
  }catch(err){
   if(err?.status===409){headId.current=null;setRemoteExists(true);}
   setState(s=>({...s,status:err?.status===409?'conflict':'error',message:String(err?.message||err)}));
  }finally{busy.current=false;}
 },[enabled]);
 const restore=useCallback(async()=>{
  if(!enabled||busy.current||!googleDrive.connected())return;
  busy.current=true;
  setState(s=>({...s,status:'syncing',message:'Đang giải mã bản sao bằng mật khẩu trên thiết bị…'}));
  try{
   const remote=await googleDrive.readPayrollState();
   if(!remote.exists)throw new Error('Drive chưa có bản sao Payroll.');
   const restored=await decryptPayrollData(remote.data,password.current);
   // Never replace user data unless UI explicitly called this restore path.
   onRestore(restored);
   headId.current=remote.snapshotId;lastHash.current=await payrollFingerprint(restored);
   setRemoteExists(true);
   setState({status:'synced',message:'Đã khôi phục bản phân tích. PDF gốc không lưu trên Drive; import lại PDF để xem đúng trang bản gốc.',
    lastSyncedAt:remote.updatedAt,snapshotId:remote.snapshotId});
  }catch(err){setState(s=>({...s,status:'error',message:String(err?.message||err)}));}
  finally{busy.current=false;}
 },[enabled,onRestore]);
 const acceptLocal=useCallback(async()=>{
  if(!enabled||busy.current||!googleDrive.connected())return;
  busy.current=true;
  try{
   const current=await googleDrive.readPayrollState();
   headId.current=current.snapshotId||'';lastHash.current=null;
   setRemoteExists(current.exists);setState(s=>({...s,status:'ready',message:'Đã xác nhận giữ bản local; sẽ tạo snapshot mới trên Drive, bản cũ không bị xóa.'}));
  }catch(err){setState(s=>({...s,status:'error',message:String(err?.message||err)}));}
  finally{busy.current=false;}
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  const interval=setInterval(()=>{if(headId.current!==null&&googleDrive.connected())void save();},WAIT_MS);
  return ()=>clearInterval(interval);
 },[enabled,save]);
 useEffect(()=>{
  if(!enabled||!data.rows?.length||headId.current===null)return;
  const t=setTimeout(()=>{if(googleDrive.connected())void save();},AFTER_CHANGE_MS);
  return ()=>clearTimeout(t);
 },[data,enabled,save]);
 const disconnect=()=>{password.current='';headId.current=null;lastHash.current=null;setEnabled(false);setState(initial);};
 return {state,enabled,remoteExists,config,setClientId,connect,save,restore,acceptLocal,disconnect};
}

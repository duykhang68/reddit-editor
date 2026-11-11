import React,{useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {scheduleLabel} from '../services/schedule.js';
import './ScheduledQueue.css';

function countdownTo(published,now){
 const target=Date.parse(published||'');
 if(!Number.isFinite(target))return {label:'Chưa có lịch hợp lệ',state:'unknown'};
 const remaining=Math.max(0,Math.ceil((target-now)/1000));
 if(remaining===0)return {label:'Đã đến giờ đăng',state:'due'};
 const days=Math.floor(remaining/86400);
 const hours=Math.floor(remaining%86400/3600);
 const minutes=Math.floor(remaining%3600/60);
 const seconds=remaining%60;
 const pad=n=>String(n).padStart(2,'0');
 return {label:(days?days+' ngày ':'')+pad(hours)+':'+pad(minutes)+':'+pad(seconds),state:'running'};
}

/**
 * Blogger is the source of truth, not the locally cached scheduling history.
 * Read the real SCHEDULED posts independently from the draft drawer filter.
 */
export default function ScheduledQueue({blogId,connected,refreshKey=0,onOpen,onViewAll}){
 const [items,setItems]=useState([]),[nextPage,setNextPage]=useState(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[updated,setUpdated]=useState('');
 const requestId=useRef(0);
 const [now,setNow]=useState(()=>Date.now());
 const reload=useCallback(async({silent=false}={})=>{
  const id=++requestId.current;
  if(!connected||!blogId){setItems([]);setNextPage(null);setError('');setUpdated('');setLoading(false);return;}
  if(!silent)setLoading(true);
  setError('');
  try{
   const qs=new URLSearchParams({blogId,status:'scheduled'});
   const result=await api('/posts?'+qs);
   if(id!==requestId.current)return;
   setItems((result.posts||[]).filter(x=>String(x.status).toLowerCase()==='scheduled').sort((a,b)=>(Date.parse(a.published)||Infinity)-(Date.parse(b.published)||Infinity)));
   setNextPage(result.nextPageToken||null);
   setUpdated(new Date().toLocaleTimeString('vi-VN'));
  }catch(e){if(id===requestId.current)setError(e.message||'Không đọc được lịch đăng từ Blogger.');}
  finally{if(id===requestId.current)setLoading(false);}
 },[blogId,connected]);
 useEffect(()=>{reload();return()=>{requestId.current++;};},[reload,refreshKey]);
 useEffect(()=>{
  if(!connected||!blogId)return;
  const timer=setInterval(()=>{if(!document.hidden)reload({silent:true});},90000);
  return()=>clearInterval(timer);
 },[connected,blogId,reload]);
 useEffect(()=>{
  if(!connected||!items.length)return;
  const clock=setInterval(()=>{if(!document.hidden)setNow(Date.now());},1000);
  const refresh=()=>setNow(Date.now());
  document.addEventListener('visibilitychange',refresh);
  return()=>{clearInterval(clock);document.removeEventListener('visibilitychange',refresh);};
 },[connected,items.length]);
 const count=items.length;
 return <section className="kit-panel scheduled-queue" aria-labelledby="scheduled-queue-title">
  <div className="kit-panel-heading scheduled-queue-head">
   <span className="kit-heading-mark" aria-hidden="true">◷</span>
   <div><h2 id="scheduled-queue-title">Các bài chờ đăng</h2><p>Queue up scheduling post · Theo lịch xuất bản trên Blogger</p></div>
   <span className="scheduled-queue-count" aria-label={count+' bài đang chờ'}>{count}{nextPage?'+':''}</span>
  </div>
  <div className="scheduled-queue-actions">
   <span>{!connected?'Chưa kết nối Blogger':loading?'Đang đồng bộ lịch đăng…':error?'Không xác minh được dữ liệu trực tiếp':updated?'Đã đối chiếu Blogger lúc '+updated:'Chưa có lần đồng bộ'}</span>
   <button type="button" disabled={!connected||!blogId||loading} onClick={()=>reload()}>↻ Làm mới</button>
  </div>
  {!connected?<p className="scheduled-queue-empty">Kết nối Blogger để xem danh sách bài chờ đăng trực tiếp.</p>
  :error?<p className="scheduled-queue-error" role="alert">{error} Danh sách cũ, nếu có, chưa được xác minh lại.</p>
  :!loading&&!count?<p className="scheduled-queue-empty">Chưa có bài nào được Blogger xác nhận đang chờ xuất bản.</p>:null}
  {count>0&&<ol className="scheduled-queue-list">{items.slice(0,5).map(item=><li key={item.id}>
   <button type="button" className="scheduled-queue-item" onClick={()=>onOpen(item)} title="Mở bài chờ đăng trong Editor">
    <span className="scheduled-queue-item-title">{item.title||'Bài viết chưa có tiêu đề'}</span>
    <span className="scheduled-queue-countdown" data-state={countdownTo(item.published,now).state} aria-label={'Đếm ngược đến giờ đăng: '+countdownTo(item.published,now).label}>
     <span className="scheduled-queue-countdown-caption">◷ Còn lại đến giờ đăng</span>
     <strong className="scheduled-queue-countdown-value">{countdownTo(item.published,now).label}</strong>
    </span>
    <span className="scheduled-queue-item-meta"><span className="scheduled-queue-status">● Đã lên lịch</span><time dateTime={item.published||undefined}>{item.published?scheduleLabel(item.published):'Chưa có ngày giờ hợp lệ'}</time></span>
   </button>
  </li>)}</ol>}
  {!!count&&<div className="scheduled-queue-foot"><button type="button" onClick={onViewAll}>Xem tất cả bài đã lên lịch {nextPage?'(còn trang tiếp)':''} ↗</button></div>}
  <p className="scheduled-queue-note">Dữ liệu lấy từ Blogger. Nếu lịch được đổi hoặc bài đã đăng trên thiết bị khác, nhấn Làm mới để cập nhật. Không dùng bộ nhớ trình duyệt làm trạng thái xác nhận.</p>
 </section>;
}

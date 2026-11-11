import React, {useEffect,useMemo,useState} from 'react';
import {formatScheduleInZone,localTimeZone,scheduleLabel,scheduleLocalToIso,SCHEDULE_ZONES} from '../services/schedule.js';
import './schedule.css';

export default function SchedulePost({open,post,title,busy,onClose,onSchedule,onCancel}) {
  const [timeZone,setTimeZone]=useState(localTimeZone);
  const [date,setDate]=useState('');
  const [time,setTime]=useState('09:00');
  const [error,setError]=useState('');
  const scheduled=String(post?.status||'').toLowerCase()==='scheduled';
  useEffect(()=>{
    if(!open)return;
    const zone=localTimeZone();setTimeZone(zone);
    const dateValue=post?.published&&scheduled?new Date(post.published):new Date(Date.now()+86400000);
    const input=formatScheduleInZone(dateValue,zone);
    setDate(input.slice(0,10));setTime(scheduled?input.slice(11,16):'09:00');setError('');
  },[open,post?.id,post?.published,scheduled]);
  const preview=useMemo(()=>{
    if(!date||!time)return '';
    try{return scheduleLabel(scheduleLocalToIso(date+'T'+time,timeZone),timeZone);}
    catch{return '';}
  },[date,time,timeZone]);
  if(!open)return null;
  const submit=async e=>{
    e.preventDefault();setError('');
    try {
      const publishDate=scheduleLocalToIso(date+'T'+time,timeZone);
      if(Date.parse(publishDate)<=Date.now()+120000)throw new Error('Lịch đăng phải cách thời điểm hiện tại ít nhất 2 phút.');
      const ok=await onSchedule({publishDate,timeZone});
      if(ok)onClose();
    }catch(err){setError(err.message||'Không thể lên lịch.');}
  };
  return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section className="schedule-dialog" role="dialog" aria-modal="true" aria-label="Schedule Post" aria-labelledby="schedule-title">
      <div className="schedule-head"><div><span className="schedule-kicker">PUBLISH STUDIO / SCHEDULER</span><h2 id="schedule-title">{scheduled?'Đổi lịch xuất bản':'Schedule a Post'}</h2><p>{title||'Bài viết chưa có tiêu đề'}</p></div><button type="button" className="dialog-close" onClick={onClose} disabled={busy} aria-label="Đóng">✕</button></div>
      <form onSubmit={submit} className="schedule-form">
        <div className="schedule-fields"><label>Ngày đăng bài<input type="date" required value={date} onChange={e=>setDate(e.target.value)} disabled={busy}/></label><label>Giờ đăng bài<input type="time" required value={time} onChange={e=>setTime(e.target.value)} disabled={busy}/></label></div>
        <label>Múi giờ<select value={timeZone} disabled={busy} onChange={e=>{const zone=e.target.value;setTimeZone(zone);}}>{SCHEDULE_ZONES.map(z=><option key={z} value={z}>{z}{z===localTimeZone()?' · Thiết bị':''}</option>)}</select></label>
        <div className="schedule-preview"><span className="schedule-dot" aria-hidden="true"/><div><strong>{preview?'Scheduled for '+preview:'Chọn ngày và giờ hợp lệ'}</strong><small>Blogger tự xuất bản; không cần mở Editor hoặc chạy máy tính.</small></div></div>
        {error&&<p className="schedule-error" role="alert">{error}</p>}
        <div className="schedule-footer"><button type="button" className="kit-button" onClick={onClose} disabled={busy}>Đóng</button>{scheduled&&<button type="button" className="schedule-cancel" disabled={busy} onClick={async()=>{setError('');try{const ok=await onCancel();if(ok!==false)onClose();}catch(err){setError(err.message||'Hủy lịch thất bại.');}}}>Hủy lịch đăng</button>}<button type="submit" className="schedule-confirm" disabled={busy||!preview}>{busy?'Đang xử lý…':scheduled?'Lưu lịch mới':'Đặt lịch đăng bài ↗'}</button></div>
      </form>
    </section>
  </div>;
}

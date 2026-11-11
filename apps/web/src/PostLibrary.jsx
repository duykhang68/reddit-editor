import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api.js';
import {googleDrive} from './services/googleDriveService.js';

export default function PostLibrary({blogId,connected,csrf,posts,filter,onFilter,loading,nextPage,onRefresh,onMore,onEdit,onRestore,onDeleted,busyEditor}){
 const [query,setQuery]=useState(''),[selected,setSelected]=useState('');
 const [working,setWorking]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [backups,setBackups]=useState([]),[backupId,setBackupId]=useState('');
 const [driveReady,setDriveReady]=useState(googleDrive.connected());
 useEffect(()=>{const t=setInterval(()=>setDriveReady(googleDrive.connected()),1500);return()=>clearInterval(t);},[]);
 useEffect(()=>{setSelected('');setBackups([]);setBackupId('');setError('');},[blogId]);
 const shown=useMemo(()=>posts.filter(p=>(p.title||'').toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))),[posts,query]);
 const chosen=posts.find(p=>String(p.id)===selected);
 async function run(label,fn){if(working)return;setWorking(label);setError('');setNotice('');try{await fn();}catch(e){setError(e.message||String(e));}finally{setWorking('');}}
 async function getFull(){if(!chosen)throw Error('Chọn một bài trước.');const data=await api('/posts/'+chosen.id+'?blogId='+encodeURIComponent(blogId));return data.post;}
 const loadBackups=()=>run('list',async()=>{if(!googleDrive.connected())throw Error('Hãy kết nối Google Drive · Markdown bên phải trước.');const list=await googleDrive.listPostBackups(blogId);setBackups(list);setBackupId(list[0]?.id||'');setNotice('Tìm thấy '+list.length+' bản sao lưu trên Drive.');});
 const saveBackup=()=>run('backup',async()=>{if(!googleDrive.connected())throw Error('Cần kết nối Google Drive trước khi sao lưu.');const actual=await getFull();const file=await googleDrive.savePostBackup(blogId,actual,'manual');setNotice('Đã sao lưu và đọc lại thành công trên Drive: '+file.name);setBackups(await googleDrive.listPostBackups(blogId));setBackupId(file.id);});
 const deletePost=()=>run('delete',async()=>{
  if(!chosen||!connected||!csrf)throw Error('Chưa chọn bài hoặc chưa đăng nhập Blogger.');
  if(!googleDrive.connected())throw Error('Chưa kết nối Drive. Không thể xóa bài nếu không sao lưu.');
  if(!confirm('XÓA VĨNH VIỄN bài “'+(chosen.title||chosen.id)+'” khỏi Blogger và blog công khai? Trước khi xóa, hệ thống sẽ sao lưu bản gốc và xác minh trên Google Drive.'))return;
  const full=await getFull();
  const file=await googleDrive.savePostBackup(blogId,full,'pre-delete');
  // Never delete if the backup upload/read-back failed.
  const check=await googleDrive.readPostBackup(file.id);
  if(check.blogId!==String(blogId)||check.post.id!==String(full.id)||check.post.updated!==full.updated||check.post.content!==full.content)
    throw Error('Bản sao lưu không khớp bài Blogger. Hủy thao tác xóa.');
  if(!confirm('Drive đã lưu và xác minh thành công: '+file.name+'. Xác nhận XÓA bài trên Blogger?')){setNotice('Đã lưu backup, không xóa bài.');return;}
  const result=await api('/posts/'+full.id,{method:'DELETE',csrf,body:{blogId,expectedUpdated:full.updated,backup:{fileId:file.id,postId:String(full.id),blogId:String(blogId),updated:full.updated}}});
  if(!result.deleted)throw Error('Blogger không xác nhận xóa. Hãy kiểm tra lại danh sách.');
  setNotice('Blogger đã xác nhận xóa bài. Backup Drive: '+file.name);
  setSelected('');setBackups(await googleDrive.listPostBackups(blogId));
  await onDeleted(full.id);
 });
 const restore=()=>run('restore',async()=>{
  if(!backupId)throw Error('Chọn một bản sao lưu trên Drive.');
  if(!googleDrive.connected())throw Error('Kết nối Google Drive trước.');
  const data=await googleDrive.readPostBackup(backupId);
  if(String(data.blogId)!==String(blogId))throw Error('Backup thuộc blog khác. Không khôi phục.');
  if(!confirm('Mở bản sao lưu “'+data.post.title+'” vào Editor thành BẢN THẢO MỚI? Không tự đăng hoặc ghi đè bài Blogger.'))return;
  const accepted=onRestore(data.post);
  if(accepted===false)return;
  setNotice('Đã mở backup vào khung soạn thảo; hãy kiểm tra và lưu bản nháp Blogger khi sẵn sàng.');
 });
 return <section className="kit-post-library" aria-labelledby="kit-post-library-title">
  <div className="kit-post-library-heading"><div><span className="kit-post-library-eyebrow">BLOGGER · CONTENT MANAGEMENT</span><h2 id="kit-post-library-title">Danh sách bài viết</h2><p>Chọn bài từ Blogger để sửa, sao lưu, khôi phục hoặc xóa có bảo vệ Drive.</p></div><button type="button" className="kit-button" disabled={!connected||loading||!!working} onClick={onRefresh}>↻ Làm mới</button></div>
  <div className="kit-post-library-controls"><div className="kit-post-library-tabs" role="group" aria-label="Trạng thái bài viết">{[['draft','Bản nháp'],['live','Đã đăng'],['scheduled','Đã lên lịch']].map(([id,name])=><button type="button" key={id} className={filter===id?'active':''} onClick={()=>onFilter(id)} disabled={!!working}>{name}</button>)}</div><input aria-label="Tìm bài viết trong danh sách đã tải" placeholder="Tìm theo tiêu đề..." value={query} onChange={e=>setQuery(e.target.value)}/></div>
  {!connected?<p className="kit-post-library-empty">Kết nối Blogger để xem danh sách bài viết thực.</p>:loading&&!posts.length?<p className="kit-post-library-empty">Đang tải bài từ Blogger…</p>:!shown.length?<p className="kit-post-library-empty">Không có bài phù hợp trong trang dữ liệu đã tải.</p>:
  <div className="kit-post-library-list" role="radiogroup" aria-label="Chọn bài viết">{shown.map(p=><label key={p.id} className={'kit-post-library-item'+(selected===String(p.id)?' selected':'')}><input type="radio" name="post-library-selection" checked={selected===String(p.id)} onChange={()=>setSelected(String(p.id))}/><span><strong>{p.title||'Không tiêu đề'}</strong><small>{p.status||filter} · {p.updated?new Date(p.updated).toLocaleString('vi-VN'):''}</small></span>{p.url&&<a href={p.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}>Xem ↗</a>}</label>)}</div>}
  {nextPage&&<button type="button" className="kit-button" disabled={loading||!!working} onClick={onMore}>＋ Tải thêm bài</button>}
  <div className="kit-post-library-actions"><button type="button" className="save" disabled={!chosen||busyEditor||!!working} onClick={()=>onEdit(chosen)}>✎ Edit · Mở vào Editor</button><button type="button" className="kit-button" disabled={!chosen||!driveReady||!!working||busyEditor} onClick={saveBackup}>☁ Sao lưu lên Drive</button><button type="button" className="kit-post-library-danger" disabled={!chosen||!driveReady||!!working||busyEditor} onClick={deletePost}>{working==='delete'?'Đang sao lưu / xóa…':'🗑 Xóa bài (backup trước)'}</button></div>
  <div className="kit-post-library-backups"><div><strong>Google Drive · Sao lưu & khôi phục</strong><button type="button" className="kit-button" disabled={!driveReady||!!working} onClick={loadBackups}>↻ Tải bản sao lưu</button></div>
   <p>{driveReady?'Drive đã kết nối. Bản backup lưu tách biệt và không ghi đè.':'Chưa kết nối Drive. Hãy dùng mục Google Drive · Markdown ở cột bên phải.'}</p>
   <div className="kit-post-library-restore"><select aria-label="Chọn phiên sao lưu" value={backupId} onChange={e=>setBackupId(e.target.value)} disabled={!driveReady||!!working}><option value="">Chọn bản sao lưu...</option>{backups.map(f=><option value={f.id} key={f.id}>{f.createdTime?new Date(f.createdTime).toLocaleString('vi-VN')+' · ':''}{f.name}</option>)}</select><button type="button" className="kit-button" disabled={!backupId||!!working||busyEditor} onClick={restore}>↓ Restore từ Drive</button></div>
  </div>
  {error&&<p role="alert" className="kit-post-library-error">{error}</p>}{notice&&<p role="status" className="kit-post-library-notice">{notice}</p>}
 </section>;
}

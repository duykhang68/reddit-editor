import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MAX_PDF_BYTES,MAX_PDF_PAGES,CATEGORIES,CATEGORY_LABELS,readVnd,extractLedger,summarizeRows,
 formatVnd,REVIEW,MATCHED} from './model.js';
import {extractPayslipPdf} from './pdfClient.js';
import {downloadWorkbook} from './xlsxExport.js';
import {knowledgeFor,WAGE_REGIONS} from './laws.js';
import {usePayrollDriveSync} from './usePayrollDriveSync.js';
import './payroll.css';

const initialPeriod=()=>{
 const values=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 return (values.find(x=>x.type==='year')?.value||'2026')+'-'+(values.find(x=>x.type==='month')?.value||'11');
};
const sectionLabel=(no,name)=><div className="pr-number"><span>{no}</span>{name}</div>;
function Metric({name,value,note,tone=''}){return <article className={'pr-metric '+tone}>
 <small>{name}</small><strong>{value}</strong><span>{note}</span>
</article>;}
function App(){
 const [fileInfo,setFileInfo]=useState(null);
 const [url,setUrl]=useState('');
 const [rows,setRows]=useState([]);
 const [period,setPeriod]=useState(initialPeriod);
 const [region,setRegion]=useState('');
 const [dependents,setDependents]=useState('0');
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState('');
 const [error,setError]=useState('');
 const [view,setView]=useState('all');
 const [search,setSearch]=useState('');
 const [page,setPage]=useState(1);
 const [originalPdf,setOriginalPdf]=useState(null);
 const generation=useRef(0);
 // URL changes must not invalidate the in-flight PDF import.
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 useEffect(()=>()=>{generation.current+=1;},[]);
 const [passphrase,setPassphrase]=useState('');
 const restoreFromDrive=useCallback(snapshot=>{
  generation.current+=1;setUrl('');setOriginalPdf(null);setRows(snapshot.rows);
  setPeriod(snapshot.period);setRegion(snapshot.region);setDependents(String(snapshot.dependents||0));
  setFileInfo({name:snapshot.filename,size:0,pages:null,remoteOnly:true});
  setProgress('Đã phục hồi bản phân tích mã hóa. PDF gốc không nằm trong backup, hãy import lại nếu muốn xem bản PDF.');
  setError('');
 },[]);
 const drivePayload=useMemo(()=>({version:1,filename:fileInfo?.name||'payroll.pdf',period,region,
  dependents:Number(dependents)||0,rows}),[fileInfo?.name,period,region,dependents,rows]);
 const drive=usePayrollDriveSync(drivePayload,restoreFromDrive);
 const summary=useMemo(()=>summarizeRows(rows),[rows]);
 const legal=useMemo(()=>knowledgeFor(rows,{period,region,dependents:Number(dependents)||0}),[rows,period,region,dependents]);
 const candidates=useMemo(()=>summary.enriched.filter(row=>(view==='all'||(view==='money'&&row.amount!==null)||
  (view==='review'&&row.status!==MATCHED)) &&
   (!search||[row.label,row.raw,CATEGORY_LABELS[row.category]].join(' ').toLocaleLowerCase('vi-VN')
    .includes(search.toLocaleLowerCase('vi-VN')))),[summary.enriched,view,search]);
 const totalPages=Math.max(1,Math.ceil(candidates.length/40));
 const visible=candidates.slice((Math.min(page,totalPages)-1)*40,Math.min(page,totalPages)*40);
 useEffect(()=>setPage(1),[view,search]);
 async function importPdf(event){
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){
   setError('Chỉ chấp nhận tệp PDF.');return;
  }
  if(!file.size||file.size>MAX_PDF_BYTES){setError('Bảng lương PDF phải nhỏ hơn 15 MB.');return;}
  const id=++generation.current;
  const blob=URL.createObjectURL(file);
  setUrl(blob);setOriginalPdf(file);setFileInfo({name:file.name,size:file.size,pages:null});
  setRows([]);setError('');setBusy(true);setProgress('Đang chuẩn bị phân tích PDF...');
  try{
   const result=await extractPayslipPdf(file,state=>{if(id===generation.current)setProgress(state.message);});
   if(id!==generation.current)return;
   const found=extractLedger(result.lines);
   setRows(found);
   setFileInfo({name:file.name,size:file.size,pages:result.pages,scannedPages:result.scannedPages.length});
   setProgress(found.length?('Đã xử lý '+result.pages+' trang và '+found.length+' dòng; cần đối chiếu bản gốc.'):
    'PDF không có dòng trích xuất hợp lệ. Bản PDF gốc vẫn hiển thị đầy đủ ở Section 2.');
  }catch(err){
   if(id===generation.current){setError(String(err?.message||'Không đọc được PDF.'));setRows([]);}
  }finally{if(id===generation.current)setBusy(false);}
 }
 function updateLine(id,key,value){
  setRows(current=>current.map(r=>{
   if(r.id!==id)return r;
   if(key==='amount')return {...r,amount:value.trim()===''?null:/^[-−]?\d{1,13}$/.test(value.trim())?Number(value.trim().replace('−','-')):readVnd(value)};
   if(key==='category')return {...r,category:value};
   if(key==='label')return {...r,label:value.slice(0,500)};
   return r;
  }));
 }
 function exportExcel(){
  if(!rows.length){setError('Chưa có dữ liệu dòng bảng lương để xuất Excel.');return;}
  setError('');
  try{downloadWorkbook(rows,{filename:fileInfo?.name||'payroll.pdf',period,region,dependents:Number(dependents)||0});}
  catch(err){setError('Xuất Excel thất bại: '+String(err?.message||err));}
 }
 function clearDocument(){
  generation.current+=1;setUrl('');setOriginalPdf(null);
  setRows([]);setFileInfo(null);setProgress('');setError('');setPage(1);
 }
 function saveOriginal(){
  if(!originalPdf)return;
  const href=URL.createObjectURL(originalPdf);
  const a=document.createElement('a');a.href=href;a.download=originalPdf.name;a.click();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
 }
 return <div className="pr-page"><main className="pr-shell">
  <header className="pr-header">
   <div className="pr-logo">₫</div>
   <div className="pr-brand">
    <div className="pr-kicker">DUY NGUYEN · REDDIT LIGHT ANALYTICS</div>
    <h1>Payroll <span>&amp; C&amp;B Insights.</span></h1>
    <p>Đọc bảng lương PDF · Đối soát công thức · Xuất Excel · Tra cứu chế độ lao động</p>
   </div>
   <a href="/" className="pr-back">Về Editor ↗</a>
  </header>
  <div className="pr-privacy"><strong>Riêng tư theo mặc định</strong>
   <span>Tệp PDF được mở và phân tích trong trình duyệt; không tự gửi bảng lương lên máy chủ, không lưu số liệu lương vào localStorage. Drive mặc định tắt; chỉ khi bạn chủ động bật mới lưu bản phân tích đã mã hóa AES-256, không upload PDF gốc.
   Thư viện PDF/OCR tải từ CDN; hãy chỉ tiếp tục nếu bạn chấp nhận tải mã thư viện đó.</span>
  </div>

  <section className="pr-panel" aria-labelledby="pr-one">
   <div className="pr-section-head">
    <div>{sectionLabel('01','SOURCE DOCUMENT')}<h2 id="pr-one">Import bảng lương thực tế</h2>
     <p>Tải PDF gốc. Giữ nguyên tài liệu ở Section 2; tự động đọc các dòng số liệu cho Smart Insights.</p></div>
    <div className="pr-stamp">LOCAL PDF</div>
   </div>
   <div className="pr-import-area">
    <label className="pr-pick" htmlFor="pr-file"><span className="pr-pick-icon">↑</span>
     <span><strong>{fileInfo?fileInfo.name:'Chọn bảng lương PDF'}</strong>
      <small>{fileInfo?.remoteOnly?'Đã khôi phục số liệu mã hóa, cần import lại PDF gốc để xem bản nguyên bản':
       fileInfo?'Dung lượng '+(fileInfo.size/1024/1024).toFixed(2)+' MB · tài liệu đã được mở trên thiết bị':
       'Tệp PDF tối đa 15 MB, 30 trang. PDF có thể là bảng lương văn bản hoặc ảnh scan.'}</small></span>
     <b>{busy?'Đang xử lý…':'Chọn file'}</b>
    </label>
    <input id="pr-file" type="file" accept=".pdf,application/pdf" onChange={importPdf} disabled={busy}/>
    <div className="pr-setup">
     <label>Kỳ lương (để chọn đúng hiệu lực luật)<input type="month" value={period} onChange={e=>setPeriod(e.target.value)}/></label>
     <label>Vùng làm việc của doanh nghiệp<select value={region} onChange={e=>setRegion(e.target.value)}>
      <option value="">Chưa biết / chưa chọn</option>{WAGE_REGIONS.map(v=><option key={v} value={v}>Vùng {v}</option>)}
     </select></label>
     <label>Số người phụ thuộc đã đăng ký<input type="number" min="0" max="30" step="1"
      value={dependents} onChange={e=>setDependents(e.target.value)} /></label>
    </div>
    <div className="pr-import-actions">
      {fileInfo&&<>{originalPdf&&<button className="pr-btn pr-btn-soft" onClick={saveOriginal}>Tải lại PDF gốc</button>}
       <button className="pr-btn pr-btn-link" onClick={clearDocument}>Xóa dữ liệu khỏi phiên xem</button></>}
    </div>
    {progress&&<p className="pr-status" role="status">{progress}</p>}
    {error&&<p className="pr-error" role="alert">{error}</p>}
   </div>
  </section>

  <section className="pr-panel pr-drive" aria-label="Sao lưu Google Drive mã hóa">
   <div className="pr-drive-heading">
    <div>{sectionLabel('↗','PRIVATE ENCRYPTED BACKUP')}<h2>Google Drive · Sao lưu có mã hóa</h2>
     <p>Chỉ mã hóa JSON phân tích; PDF gốc không được upload. Tự đồng bộ mỗi 3 phút khi trang đang mở và bạn chủ động bật.</p></div>
    <span className="pr-drive-state">{drive.enabled?'ĐÃ BẬT (MÃ HÓA)':'TẮT THEO MẶC ĐỊNH'}</span>
   </div>
   {!drive.enabled?<div className="pr-drive-controls">
    <label>Mật khẩu mã hóa (ít nhất 12 ký tự)
     <input type="password" autoComplete="new-password" value={passphrase}
      placeholder="Mật khẩu riêng, không lưu vào trình duyệt" onChange={e=>setPassphrase(e.target.value)}/>
    </label>
    {drive.config.showInput&&<label>OAuth Web Client ID
      <input type="password" autoComplete="off" spellCheck="false" value={drive.config.clientId}
       placeholder="xxx.apps.googleusercontent.com" onChange={e=>drive.setClientId(e.target.value)}/></label>}
    <button className="pr-btn pr-btn-primary" disabled={drive.config.loading||passphrase.length<12||drive.state.status==='connecting'}
     onClick={async()=>{await drive.connect(passphrase);setPassphrase('');}}>
     {drive.state.status==='connecting'?'Đang kết nối…':'Kết nối & bật sao lưu mã hóa'}</button>
   </div>:<div className="pr-drive-actions">
    <button className="pr-btn pr-btn-soft" disabled={!rows.length||drive.state.status==='syncing'||drive.state.status==='conflict'}
     onClick={()=>void drive.save({force:true})}>Đồng bộ ngay</button>
    {drive.state.status==='conflict'&&<>
     <button className="pr-btn pr-btn-soft" onClick={()=>{
      if(window.confirm('Khôi phục Drive sẽ thay các dòng hiện tại. PDF gốc không được lưu trên Drive. Tiếp tục?'))
       void drive.restore();
     }}>Giải mã & khôi phục từ Drive</button>
     <button className="pr-btn pr-btn-soft" disabled={!rows.length} onClick={async()=>{
      if(!window.confirm('Tạo snapshot mã hóa mới từ bản hiện tại? Bản Drive cũ vẫn được giữ.'))return;
      await drive.acceptLocal();await drive.save({force:true});
     }}>Giữ bản hiện tại, tạo snapshot mới</button>
    </>}
    <button className="pr-btn pr-btn-link" onClick={drive.disconnect}>Tắt tự đồng bộ</button>
   </div>}
   <p className={'pr-drive-message pr-drive-'+drive.state.status} role="status">{drive.state.message}
    {drive.state.lastSyncedAt?' · Lần lưu: '+new Date(drive.state.lastSyncedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):''}</p>
   <p className="pr-fine">Mật khẩu không được lưu trên Drive hoặc thiết bị. Nếu quên mật khẩu sẽ không giải mã được bản sao.
    Không có upload tự động trước khi bạn bật sao lưu. Chỉ dữ liệu bảng phân tích được lưu; muốn xem đúng PDF 1:1 vẫn cần file gốc.</p>
  </section>

  <section className="pr-panel" aria-labelledby="pr-two">
   <div className="pr-section-head"><div>{sectionLabel('02','ORIGINAL DOCUMENT')}
    <h2 id="pr-two">Bảng lương PDF gốc · Hiển thị nguyên bản</h2>
    <p>Trình xem dùng trực tiếp các byte của PDF đã import. Không tái dựng, không chỉnh vị trí, font hoặc công thức trong chứng từ gốc.</p></div>
    {fileInfo&&<span className="pr-chip">{fileInfo.pages??'…'} trang</span>}
   </div>
   {url?<div className="pr-pdf-viewer">
    <object key={url} data={url+'#toolbar=1&navpanes=0&view=FitH'} type="application/pdf" aria-label="Bảng lương PDF nguyên gốc">
     <p>Trình duyệt không hỗ trợ xem PDF nhúng. <button onClick={saveOriginal}>Mở bản gốc đã tải</button></p>
    </object></div>:<div className="pr-empty">
    <span>▧</span><strong>Chưa có bảng lương PDF</strong>
    <p>Import tệp ở Section 1 để xem bản gốc theo đúng bố cục và số trang.</p>
   </div>}
   <p className="pr-fine">Bảo toàn bản gốc nghĩa là xem trực tiếp PDF, không phải nhận diện lại 100% ký tự. Khả năng hiển thị phụ thuộc trình xem PDF của trình duyệt.</p>
  </section>

  <section className="pr-panel" aria-labelledby="pr-three">
   <div className="pr-section-head"><div>{sectionLabel('03','FORMULA INTELLIGENCE')}
    <h2 id="pr-three">Smart Insights · Phân tích từng dòng</h2>
    <p>Đọc các dòng thực tế, phân loại C&amp;B và chỉ tạo công thức Excel khi kết quả khớp với số gốc.</p></div>
    <button className="pr-btn pr-btn-primary" disabled={!rows.length||busy} onClick={exportExcel}>↓ Xuất Excel có công thức</button>
   </div>
   <div className="pr-metrics">
    <Metric name="Dòng đã đọc" value={summary.total} note="Bao gồm dòng chưa có số tiền"/>
    <Metric name="Có giá trị tiền" value={summary.withAmounts} note="Giữ nguyên số OCR gốc"/>
    <Metric name="Công thức khớp" value={summary.verified} note="Khớp kết quả số học" tone="pr-positive"/>
    <Metric name="Cần xác nhận" value={summary.review} note="Không đoán công thức" tone="pr-attention"/>
   </div>
   <div className="pr-summary-strip">
    <div><small>Tổng thu nhập</small><strong>{formatVnd(summary.gross)}</strong></div>
    <div><small>Tổng khấu trừ</small><strong>{formatVnd(summary.deduction)}</strong></div>
    <div><small>Thực nhận</small><strong>{formatVnd(summary.net)}</strong></div>
   </div>
   <div className="pr-table-filters">
    <label>Hiển thị<select value={view} onChange={e=>setView(e.target.value)}>
     <option value="all">Tất cả dòng</option><option value="money">Có số tiền</option><option value="review">Cần xác nhận</option>
    </select></label>
    <input type="search" value={search} autoComplete="off" placeholder="Tìm dòng lương, khoản khấu trừ..." onChange={e=>setSearch(e.target.value)}/>
    <span>{candidates.length} dòng</span>
   </div>
   <div className="pr-table-scroll"><table className="pr-table"><thead><tr>
    <th>Trang</th><th>Nội dung dòng</th><th>Loại khoản</th><th>Số từ PDF (đ)</th><th>Công thức Excel</th><th>Đối soát / giải thích</th>
   </tr></thead><tbody>{visible.map(r=><tr key={r.id}>
    <td>{r.page}</td>
    <td><input className="pr-line-input" value={r.label} onChange={e=>updateLine(r.id,'label',e.target.value)}
      aria-label={'Diễn giải dòng '+r.excelRow}/><small title={r.raw}>Gốc: {r.raw}</small></td>
    <td><select value={r.category} onChange={e=>updateLine(r.id,'category',e.target.value)}
       aria-label={'Phân loại dòng '+r.excelRow}>
     {CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
    <td><input type="text" className="pr-money-input" value={r.amount===null?'':String(r.amount)}
      onChange={e=>updateLine(r.id,'amount',e.target.value)} aria-label={'Số tiền dòng '+r.excelRow}/>
    </td>
    <td><code>{r.formula?'='+r.formula:'—'}</code></td>
    <td><strong className={r.status===MATCHED?'pr-good':'pr-review'}>{r.status}</strong>
     <small>{r.explanation}</small></td>
   </tr>)}</tbody></table>
    {!visible.length&&<div className="pr-empty-small">Chưa có dòng phù hợp. Import PDF ở trên hoặc đổi bộ lọc.</div>}
   </div>
   {totalPages>1&&<div className="pr-paging">
    <button disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Trước</button>
    <span>Trang {Math.min(page,totalPages)} / {totalPages}</span>
    <button disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Sau</button></div>}
   <p className="pr-fine">Excel gồm 4 sheet: Bảng lương (số gốc và công thức kiểm tra), Smart Insights, C&amp;B Knowledge, Hướng dẫn.
   Công thức chỉ được xuất khi khớp với dữ liệu PDF. Các ô thiếu căn cứ vẫn để trống; bạn có thể sửa dữ liệu trích xuất ở bảng phía trên trước khi xuất.</p>
  </section>

  <section className="pr-panel" aria-labelledby="pr-four">
   <div className="pr-section-head"><div>{sectionLabel('04','C&B KNOWLEDGE BASE')}
    <h2 id="pr-four">Chế độ, bảo hiểm, thuế và pháp luật lao động</h2>
    <p>Liên kết các khoản đã nhận diện ở Section 3 với quy định có hiệu lực theo kỳ lương, kèm nguồn văn bản gốc.</p></div>
    <span className="pr-chip">Rà soát nguồn: {legal.sourceReviewed}</span>
   </div>
   <div className="pr-law-grid">{legal.items.map(entry=><article className="pr-law" key={entry.id}>
    <div className="pr-law-top"><h3>{entry.title}</h3><span>{entry.status}</span></div>
    <p>{entry.detail}</p>
    <div className="pr-law-bottom"><span>{entry.law.id} · {entry.confidence}</span>
     <a href={entry.law.url} target="_blank" rel="noopener noreferrer">Văn bản chính thức ↗</a></div>
   </article>)}</div>
   <div className="pr-legal-note"><strong>Giới hạn tư vấn:</strong> Đây là nghiên cứu hỗ trợ đối chiếu, không thay thế tư vấn pháp lý hoặc xác nhận của bộ phận C&amp;B.
    Các khoản phụ cấp, giảm trừ, bảo hiểm, thuế phụ thuộc hợp đồng, vùng làm việc, thời điểm trả lương, đối tượng tham gia và hồ sơ nhân sự.
   </div>
  </section>
  <footer className="pr-footer"><span>© Duy Nguyen · Payroll & C&amp;B Insights</span><span>PDF không tải lên máy chủ · Nguồn pháp luật dẫn đến văn bản chính thức</span></footer>
 </main></div>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);

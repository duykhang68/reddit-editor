import React,{useMemo,useRef,useState} from 'react';
import {
  STORAGE_KEY,CATEGORIES,allCategories,amountValue,daysInMonth,emptyData,getBudget,insightTips,
  money,monthBefore,monthOf,newCategory,normalizeData,normalizeTransaction,spendingMetrics,toCsv,todayVN
} from './model.js';
import {useExpenseDriveSync} from './useExpenseDriveSync.js';

const makeId=()=>globalThis.crypto?.randomUUID?.()||'expense-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const blankForm=()=>({amount:'',categoryId:'food',note:'',date:todayVN()});
const displayDate=date=>new Intl.DateTimeFormat('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(date+'T12:00:00+07:00'));
const yesterday=date=>new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const monthLabel=month=>month.slice(5)+'/'+month.slice(0,4);
const limitString=value=>value==null?'':String(value);
const statusOf=(amount,limit)=>limit===null||limit===undefined?'unconfigured':limit===0?(amount>0?'exceeded':'safe'):amount>=limit?'exceeded':amount>=limit*.8?'warning':'safe';
const pct=(amount,limit)=>limit===null||limit===undefined?null:limit>0?Math.round(amount/limit*100):(amount>0?Infinity:0);
function Icon({name,size=20}){
  const paths={
    wallet:<><rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 10h18m-5 5h2M6 6V4h12"/></>,
    plus:<path d="M12 5v14M5 12h14"/>,
    coffee:<><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 1h2a3 3 0 0 1 0 6h-2M8 3v2m4-2v2M3 22h17"/></>,
    utensils:<><path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-5 3-5 10 0 12"/></>,
    car:<><path d="M5 17h14M4 17V9l2-4h12l2 4v8M4 10h16M7 17v3m10-3v3M7 13h1m8 0h1"/></>,
    receipt:<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3ZM9 8h6M9 12h6"/></>,
    bag:<><path d="M4 9h16l-1 12H5L4 9Zm4 0V7a4 4 0 0 1 8 0v2"/></>,
    spark:<><path d="m12 2 2 8 8 2-8 2-2 8-2-8-8-2 8-2 2-8Z"/></>,
    tag:<><path d="M20 13 13 20 3 10V3h7l10 10ZM7 7h.01"/></>,
    chart:<><path d="M3 3v18h18M7 15l4-4 3 2 5-7m-2 0h2v2"/></>,
    calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18"/></>,
    arrow:<path d="m15 18-6-6 6-6"/>,
    download:<><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
    upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/></>,
    trash:<><path d="M4 7h16M10 3h4M6 7l1 14h10l1-14m-7-6v6m4-6v6"/></>,
    edit:<><path d="m4 20 5-.7L20 8.5 15.5 4 4.7 15 4 20Z"/></>,
    shield:<><path d="m12 2 9 4v6c0 6-4 9-9 10-5-1-9-4-9-10V6l9-4Zm-4 10 3 3 5-6"/></>,
    alert:<><path d="M12 3 2 21h20L12 3Zm0 7v5m0 3h.01"/></>,
    chevron:<path d="m9 18 6-6-6-6"/>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.tag}</svg>;
}
function Meter({value,limit,small=false}){
  const ratio=pct(value,limit),status=statusOf(value,limit);
  return <div className={'ex-meter ex-meter-'+status+(small?' ex-meter-small':'')} role="progressbar"
    aria-label="Mức ngân sách đã sử dụng" aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={ratio===null?undefined:Math.min(100,Number.isFinite(ratio)?ratio:100)}
    aria-valuetext={ratio===null?'Chưa thiết lập hạn mức':Number.isFinite(ratio)?ratio+'% ngân sách':'Vượt hạn mức'}>
    <span style={{width:ratio===null?'0%':Math.max(0,Math.min(100,Number.isFinite(ratio)?ratio:100))+'%'}}/>
  </div>;
}
function DailyChart({dailyRows,month}){
  const series=useMemo(()=>{
    const map=new Map(dailyRows.map(row=>[Number(row.date.slice(8)),row.amount]));
    return Array.from({length:daysInMonth(month)},(_,day)=>({day:day+1,amount:map.get(day+1)||0}));
  },[dailyRows,month]);
  const peak=Math.max(1,...series.map(d=>d.amount));
  return <div className="ex-chart-scroll"><div className="ex-chart" role="img" aria-label={'Biểu đồ chi tiêu theo ngày trong tháng '+monthLabel(month)}>
    {series.map(item=><div key={item.day} className="ex-chart-column" title={'Ngày '+item.day+': '+money(item.amount)}>
      <div className="ex-chart-bar-zone"><div className={'ex-chart-bar'+(item.amount===peak&&peak>1?' is-peak':'')} style={{height:item.amount?Math.max(5,item.amount/peak*100)+'%':'2px'}} /></div>
      <span>{item.day===1||item.day%5===0||item.day===series.length?item.day:''}</span>
    </div>)}
  </div></div>;
}
function SectionHeading({eyebrow,title,sub,children}){
  return <div className="ex-section-head"><div><span className="ex-eyebrow">{eyebrow}</span><h2>{title}</h2>{sub&&<p>{sub}</p>}</div>{children&&<div className="ex-section-actions">{children}</div>}</div>;
}
export default function Expenses(){
  const [data,setData]=useState(()=>{
    try{const raw=localStorage.getItem(STORAGE_KEY);return raw?normalizeData(JSON.parse(raw)):emptyData();}
    catch{return emptyData();}
  });
  const {sync,conflict,connected,connect,synchronize,resolveConflict,clientConfig,setManualClientId,toggleClientIdInput}=useExpenseDriveSync(data,setData);
  const [month,setMonth]=useState(()=>monthOf(todayVN()));
  const [categoryFilter,setCategoryFilter]=useState('all');
  const [form,setForm]=useState(blankForm);
  const [editing,setEditing]=useState(null);
  const [categoryOpen,setCategoryOpen]=useState(false);
  const [categoryName,setCategoryName]=useState('');
  const [budgetOpen,setBudgetOpen]=useState(false);
  const [budgetDraft,setBudgetDraft]=useState(null);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const [feedLimit,setFeedLimit]=useState(30);
  const importRef=useRef(null);
  const today=todayVN();
  const categories=useMemo(()=>allCategories(data),[data]);
  const metrics=useMemo(()=>spendingMetrics(data,month,today),[data,month,today]);
  const allBudgets=getBudget(data,month);
  const years=useMemo(()=>{
    const y=new Set([Number(today.slice(0,4)),Number(month.slice(0,4)),...data.transactions.map(tx=>Number(tx.date.slice(0,4))),...Object.keys(data.budgets).map(key=>Number(key.slice(0,4)))]);
    return [...y].filter(n=>n>=2000&&n<=2100).sort((a,b)=>b-a);
  },[data,month,today]);
  const selectedItems=useMemo(()=>metrics.items.filter(tx=>categoryFilter==='all'||tx.categoryId===categoryFilter)
    .sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)),[metrics.items,categoryFilter]);
  const visibleItems=selectedItems.slice(0,feedLimit);
  const grouped=useMemo(()=>{
    const map=new Map();
    visibleItems.forEach(tx=>{if(!map.has(tx.date))map.set(tx.date,[]);map.get(tx.date).push(tx);});
    return [...map.entries()];
  },[visibleItems]);
  const tips=insightTips(metrics);
  const save=(next,message)=>{
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      setData(next);setError('');if(message)setNotice(message);return true;
    }catch{setError('Không lưu được dữ liệu trên thiết bị. Hãy kiểm tra dung lượng và quyền lưu trữ.');return false;}
  };
  const updateForm=(key,value)=>setForm(previous=>({...previous,[key]:value}));
  const switchMonth=next=>{
    setMonth(next);setCategoryFilter('all');setFeedLimit(30);setBudgetOpen(false);setBudgetDraft(null);
  };
  const startBudget=()=>{
    const current=getBudget(data,month);
    setBudgetDraft({total:limitString(current.total),categories:Object.fromEntries(categories.map(item=>[item.id,limitString(current.categories[item.id])]))});
    setBudgetOpen(true);
  };
  const saveBudget=event=>{
    event.preventDefault();
    try{
      const total=amountValue(budgetDraft.total,{zero:true});
      const perCategory={};
      categories.forEach(item=>{perCategory[item.id]=amountValue(budgetDraft.categories[item.id],{zero:true});});
      if(save({...data,budgets:{...data.budgets,[month]:{total,categories:perCategory}}},'Đã lưu hạn mức riêng cho tháng '+monthLabel(month)+'.')){setBudgetOpen(false);setBudgetDraft(null);}
    }catch(e){setError(e.message);}
  };
  const createCategory=event=>{
    event.preventDefault();
    try{
      const created=newCategory(categoryName,categories);
      if(!save({...data,customCategories:[...data.customCategories,created]},'Đã tạo và lưu danh mục '+created.label+'.'))return;
      updateForm('categoryId',created.id);
      setCategoryOpen(false);setCategoryName('');
      if(budgetOpen)setBudgetDraft(current=>({...current,categories:{...current.categories,[created.id]:''}}));
    }catch(e){setError(e.message);}
  };
  const submit=event=>{
    event.preventDefault();
    try{
      const tx=normalizeTransaction({...form,id:editing||makeId()},categories);
      const nextItems=editing?data.transactions.map(item=>item.id===editing?tx:item):[tx,...data.transactions];
      if(save({...data,transactions:nextItems},editing?'Đã chỉnh sửa giao dịch.':'Đã ghi nhận chi tiêu và cập nhật Insights.')){
        setForm({...blankForm(),categoryId:tx.categoryId,date:todayVN()});setEditing(null);
        switchMonth(monthOf(tx.date));
      }
    }catch(e){setError(e.message);}
  };
  const edit=tx=>{
    setEditing(tx.id);
    setForm({amount:String(tx.amount),categoryId:tx.categoryId,note:tx.note,date:tx.date});
    document.getElementById('ex-input')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  const remove=tx=>{
    if(!window.confirm('Xóa giao dịch '+money(tx.amount)+' ngày '+displayDate(tx.date)+'?'))return;
    if(save({...data,transactions:data.transactions.filter(item=>item.id!==tx.id)},'Đã xóa giao dịch.')){
      if(editing===tx.id){setEditing(null);setForm(blankForm());}
    }
  };
  const download=(payload,filename,type)=>{
    const url=URL.createObjectURL(new Blob([payload],{type}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
    document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  };
  const exportJson=()=>download(JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),'daily-expenses-backup.json','application/json');
  const exportCsv=()=>download(toCsv(selectedItems,categories),'daily-expenses-'+month+'.csv','text/csv;charset=utf-8');
  const importJson=async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>5*1024*1024)throw Error('File quá lớn (tối đa 5 MB).');
      const incoming=normalizeData(JSON.parse(await file.text()));
      if(!window.confirm('Khôi phục '+incoming.transactions.length+' giao dịch và '+incoming.customCategories.length+' danh mục tùy chỉnh? Dữ liệu hiện tại sẽ bị ghi đè.'))return;
      if(save(incoming,'Đã khôi phục dữ liệu từ file JSON.')){setEditing(null);setForm(blankForm());setCategoryFilter('all');setBudgetOpen(false);}
    }catch(e){setError('Không nhập được: '+e.message);}
    finally{event.target.value='';}
  };
  const lookup=new Map(categories.map(item=>[item.id,item]));
  const spentPercent=pct(metrics.spent,metrics.limit);
  const budgetStatus=statusOf(metrics.spent,metrics.limit);
  const projectedExcess=metrics.forecast!=null&&metrics.limit>0?Math.round((metrics.forecast/metrics.limit-1)*100):null;
  const topRatio=metrics.top&&metrics.spent?Math.round(metrics.top.amount/metrics.spent*100):0;
  const monthDay=Number(month.slice(5));
  const todayMonth=monthOf(today);
  return <div className="ex-page"><div className="ex-shell">
    <header className="ex-header">
      <div className="ex-identity"><span className="ex-brand-icon"><Icon name="wallet" size={27}/></span>
        <div><div className="ex-eyebrow">DUY NGUYEN · PERSONAL FINANCE</div><h1>Daily Expenses <em>&amp; Insights.</em></h1><p>Giữ mọi chi tiêu trong tầm kiểm soát.</p></div>
      </div>
      <div className="ex-header-actions">
        <span className={'ex-data-note ex-cloud-note ex-cloud-'+sync.status} role="status" title={sync.message}>
          <span className="ex-live-dot"/> {sync.status==='synced'?'Đã lưu Google Drive':sync.status==='ready'?'Drive đã kết nối':sync.status==='syncing'||sync.status==='connecting'?'Đang đồng bộ…':sync.status==='conflict'?'Xung đột dữ liệu':sync.status==='pending'?'Chờ sao lưu Drive':sync.status==='error'?'Cần kiểm tra đồng bộ':'Chưa kết nối Drive'}
        </span>
        {!connected&&<button type="button" className="ex-outline-link ex-drive-connect" onClick={()=>void connect()}
          disabled={clientConfig.loading||sync.status==='connecting'}>
          <Icon name="upload" size={16}/> {clientConfig.loading?'Đang tìm OAuth…':sync.status==='connecting'?'Đang kết nối…':'Kết nối Google Drive'}
        </button>}
        <button type="button" className="ex-outline-link ex-sync-button" onClick={()=>void synchronize()}
          disabled={!connected||sync.status==='syncing'||sync.status==='connecting'} aria-label="Đồng bộ dữ liệu chi tiêu lên Google Drive ngay">
          <Icon name="upload" size={16}/> {sync.status==='syncing'?'Đang lưu…':'Đồng bộ ngay'}
        </button>
        <a href="/starbucks-insights/" className="ex-outline-link">Starbucks Insights</a>
        <a href="/" className="ex-outline-link"><Icon name="arrow" size={16}/> Editor</a>
      </div>
    </header>
    <div className="ex-cloud-summary" aria-live="polite">
      <span>{sync.message}</span>
      <span>Google Drive tự đồng bộ mỗi 3 phút khi trang đang mở và phiên Drive còn hiệu lực. {sync.lastSyncedAt?'Lần lưu Drive gần nhất: '+new Date(sync.lastSyncedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có bản sao Drive được xác nhận.'}</span>
      {sync.snapshotId&&<a href={'https://drive.google.com/file/d/'+encodeURIComponent(sync.snapshotId)+'/view'} target="_blank" rel="noopener noreferrer">Xem file sao lưu trên Drive</a>}
      {!connected&&!clientConfig.loading&&clientConfig.clientId&&!clientConfig.showInput&&
        <button type="button" className="ex-config-toggle" onClick={toggleClientIdInput}>Đổi Client ID</button>}
    </div>
    {!connected&&clientConfig.showInput&&<div className="ex-drive-config-panel">
      <label htmlFor="ex-drive-client-id">OAuth Web Client ID dùng chung Editor</label>
      <input id="ex-drive-client-id" type="password" value={clientConfig.clientId}
        placeholder="123456789-abcdef.apps.googleusercontent.com"
        autoComplete="off" spellCheck="false"
        onChange={event=>setManualClientId(event.target.value)}/>
      <p>Chỉ cần nhập nếu không tìm được cấu hình tự động hoặc Google từ chối Client ID hiện có. Dùng cùng Client ID tại Editor → Google Drive · Markdown. Đây là ID công khai, không phải Client Secret.</p>
    </div>}

    <section className="ex-panel ex-hero" aria-label="Tổng quan ngân sách">
      <div className="ex-hero-top"><div><div className="ex-eyebrow">MONTHLY BUDGET OVERVIEW</div><h2>Ngân sách sinh hoạt <span>tháng {monthLabel(month)}</span></h2></div>
        <div className="ex-filters"><label>Tháng<select aria-label="Chọn tháng" value={monthDay} onChange={event=>switchMonth(month.slice(0,4)+'-'+String(event.target.value).padStart(2,'0'))}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>Tháng {i+1}</option>)}</select></label>
          <label>Năm<select aria-label="Chọn năm" value={Number(month.slice(0,4))} onChange={event=>switchMonth(event.target.value+month.slice(4))}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
          <label>Danh mục<select aria-label="Lọc danh mục lịch sử giao dịch" value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setFeedLimit(30);}}><option value="all">Tất cả danh mục</option>{categories.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
      </div>
      <div className="ex-summary-grid">
        <div className="ex-summary-main"><div className="ex-mini-label">ĐÃ CHI TRONG THÁNG</div><div className="ex-main-amount">{money(metrics.spent)}</div>
          <div className="ex-summary-budget">Ngân sách tổng: <strong>{metrics.limit==null?'Chưa thiết lập':money(metrics.limit)}</strong></div>
          <Meter value={metrics.spent} limit={metrics.limit}/>
          <div className="ex-progress-row"><span className={'ex-status ex-status-'+budgetStatus}>{spentPercent==null?'Chọn “Cài ngân sách” để bắt đầu':Number.isFinite(spentPercent)?'Đã dùng '+spentPercent+'%':'Vượt hạn mức'}</span><span>{metrics.remaining===null?'Chưa có hạn mức':metrics.remaining>=0?'Còn '+money(metrics.remaining):'Vượt '+money(-metrics.remaining)}</span></div>
        </div>
        <div className="ex-kpis">
          <div className="ex-kpi"><span>Trung bình mỗi ngày</span><strong>{money(metrics.average)}</strong><small>{metrics.elapsed?metrics.elapsed+' ngày đã qua':'Chưa bắt đầu kỳ theo dõi'}</small></div>
          <div className="ex-kpi"><span>Dự báo cuối tháng</span><strong>{metrics.forecast===null?'—':money(metrics.forecast)}</strong><small>{metrics.forecast===null?'Chỉ tính cho tháng hiện tại':'Ước tính theo số ngày đã qua'}</small></div>
          <div className="ex-kpi"><span>Giao dịch đã ghi</span><strong>{metrics.items.length}</strong><small>{categoryFilter==='all'?'Toàn bộ danh mục':'Tổng toàn tháng, chưa lọc danh mục'}</small></div>
        </div>
      </div>
      <div className="ex-hero-actions"><button className="ex-btn ex-btn-forest" onClick={startBudget} type="button"><Icon name="edit" size={16}/> Cài ngân sách tháng</button><span>Ngân sách tổng và từng danh mục được cấu hình riêng cho mỗi tháng.</span></div>
    </section>

    {conflict&&<section className="ex-panel ex-cloud-conflict" aria-label="Xử lý xung đột dữ liệu">
      <div className="ex-cloud-conflict-heading"><Icon name="alert" size={20}/><div><strong>Cần xử lý hai bản dữ liệu khác nhau</strong><p>Không tự ghi đè dữ liệu từ thiết bị khác. Bản local và các file lịch sử trên Google Drive được giữ nguyên. Hệ thống sẽ tải file JSON dự phòng trước khi chọn bản thay thế.</p></div></div>
      <div className="ex-cloud-conflict-actions">
        <button className="ex-btn ex-btn-subtle" type="button" onClick={()=>void resolveConflict('drive')}>Sao lưu local &amp; khôi phục Drive</button>
        <button className="ex-btn ex-btn-forest" type="button" onClick={()=>void resolveConflict('local')}>Sao lưu Drive &amp; dùng bản local</button>
      </div>
    </section>}
    {error&&<div className="ex-message ex-error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Đóng lỗi" type="button">×</button></div>}
    {notice&&<div className="ex-message ex-success" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Đóng thông báo" type="button">×</button></div>}

    {budgetOpen&&budgetDraft&&<section className="ex-panel ex-budget-editor" aria-label="Thiết lập hạn mức">
      <SectionHeading eyebrow="BUDGET SETTINGS" title={'Thiết lập hạn mức · '+monthLabel(month)} sub="Để trống nếu không muốn đặt hạn mức; 0đ nghĩa là không được chi. Hạn mức danh mục không tự cộng thành ngân sách tổng."/>
      <form onSubmit={saveBudget}><label className="ex-field ex-overall-limit">Ngân sách tổng (VND)<input type="number" min="0" max="1000000000000" step="1" placeholder="Ví dụ 12000000" value={budgetDraft.total} onChange={e=>setBudgetDraft(s=>({...s,total:e.target.value}))}/></label>
        <div className="ex-limit-fields">{categories.map(item=><label key={item.id} className="ex-field">{item.label}<input type="number" min="0" max="1000000000000" step="1" placeholder="Không giới hạn" value={budgetDraft.categories[item.id]??''} onChange={e=>setBudgetDraft(s=>({...s,categories:{...s.categories,[item.id]:e.target.value}}))}/></label>)}</div>
        <div className="ex-form-actions"><button className="ex-btn ex-btn-primary" type="submit">Lưu ngân sách</button><button className="ex-btn ex-btn-subtle" type="button" onClick={()=>{setBudgetOpen(false);setBudgetDraft(null);}}>Hủy</button></div>
      </form>
    </section>}

    <div className="ex-main-grid">
      <section className="ex-panel ex-entry" id="ex-input">
        <SectionHeading eyebrow="01 / QUICK ENTRY" title={editing?'Sửa khoản chi.':'Ghi chi tiêu nhanh.'} sub="Nhập một khoản chi trong vài giây. Enter để lưu."/>
        <form onSubmit={submit} className="ex-entry-form">
          <label className="ex-field">Số tiền (VND)<input autoFocus inputMode="numeric" type="number" min="1" max="1000000000000" step="1" placeholder="Ví dụ: 45000" required value={form.amount} onChange={e=>updateForm('amount',e.target.value)}/></label>
          <label className="ex-field">Danh mục<select value={form.categoryId} onChange={e=>updateForm('categoryId',e.target.value)}>{categories.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <button type="button" className="ex-create-category" aria-expanded={categoryOpen} onClick={()=>setCategoryOpen(v=>!v)}><Icon name="plus" size={17}/> Thêm danh mục mới</button>
          {categoryOpen&&<div className="ex-category-create"><label className="ex-field">Tên danh mục mới<input placeholder="Ví dụ: Nuôi thú cưng" maxLength="48" value={categoryName} onChange={e=>setCategoryName(e.target.value)}/></label><button className="ex-btn ex-btn-primary" type="button" onClick={createCategory}>Tạo &amp; lưu</button><p>Danh mục được lưu ngay trên thiết bị; Google Drive tự sao lưu khi đã kết nối.</p></div>}
          <label className="ex-field">Ghi chú ngắn<input type="text" placeholder="Ví dụ: Bữa trưa, cà phê sáng…" maxLength="180" value={form.note} onChange={e=>updateForm('note',e.target.value)}/></label>
          <label className="ex-field">Ngày chi tiêu<input type="date" required value={form.date} min="2000-01-01" max="2100-12-31" onChange={e=>updateForm('date',e.target.value)}/></label>
          <div className="ex-form-actions"><button className="ex-btn ex-btn-primary" type="submit"><Icon name="plus" size={18}/>{editing?'Lưu thay đổi':'Ghi nhận chi tiêu'}</button>{editing&&<button className="ex-btn ex-btn-subtle" type="button" onClick={()=>{setEditing(null);setForm(blankForm());}}>Hủy sửa</button>}</div>
        </form>
      </section>
      <section className="ex-panel ex-smart-panel">
        <SectionHeading eyebrow="02 / SMART FINANCIAL INSIGHTS" title="Money intelligence." sub="Phân tích trực tiếp từ các giao dịch đã ghi nhận."/>
        <div className="ex-insight-list">
          <article className={'ex-insight '+(projectedExcess>0?'ex-insight-alert':'')}><span className="ex-insight-icon"><Icon name="chart"/></span><div><h3>Spending velocity</h3><p>{metrics.forecast===null?'Dự báo tốc độ chi tiêu chỉ áp dụng cho tháng đang diễn ra.':metrics.limit===null?'Thiết lập ngân sách tổng để so sánh dự báo cuối tháng.':projectedExcess>0?'Theo nhịp chi hiện tại, có thể vượt ngân sách khoảng '+projectedExcess+'% vào cuối tháng.':'Dự báo cuối tháng '+money(metrics.forecast)+' so với hạn mức '+money(metrics.limit)+'.'}</p></div></article>
          <article className="ex-insight"><span className="ex-insight-icon"><Icon name="wallet"/></span><div><h3>Top spending category</h3><p>{metrics.top?'“'+metrics.top.label+'” chiếm '+topRatio+'% tổng chi ('+money(metrics.top.amount)+'). '+(allBudgets.categories[metrics.top.id]==null?'Chưa có hạn mức danh mục.':'Hạn mức '+money(allBudgets.categories[metrics.top.id])+'.'):'Chưa có danh mục nào phát sinh chi tiêu.'}</p></div></article>
          <article className={'ex-insight '+(metrics.warnings.length?'ex-insight-alert':'')}><span className="ex-insight-icon"><Icon name="alert"/></span><div><h3>Category limit warnings</h3><p>{metrics.warnings.length?metrics.warnings.map(item=>item.label+' ('+(Number.isFinite(item.percent)?Math.round(item.percent)+'%':'vượt giới hạn')+')').join(' · '):'Chưa có danh mục nào đạt 80% hạn mức đã cài.'}</p></div></article>
          <article className="ex-insight"><span className="ex-insight-icon"><Icon name="calendar"/></span><div><h3>Daily average &amp; anomalies</h3><p>Trung bình {money(metrics.average)}/ngày. {metrics.anomalies.length?metrics.anomalies.length+' ngày chi tiêu đột biến cần rà soát.':'Chưa phát hiện bất thường đủ dữ liệu.'}</p></div></article>
        </div>
        <div className="ex-tip-panel"><span className="ex-eyebrow">ACTIONABLE MICRO-TIPS</span>{tips.map((tip,i)=><p key={i}>✦ {tip}</p>)}</div>
      </section>
    </div>

    <section className="ex-panel ex-categories">
      <SectionHeading eyebrow="03 / CATEGORY BUDGET TRACKER" title="Chi tiêu theo danh mục." sub="Hạn mức từng danh mục áp dụng cả danh mục mặc định lẫn danh mục tự tạo."><button className="ex-btn ex-btn-subtle" onClick={startBudget} type="button"><Icon name="edit" size={15}/> Chỉnh hạn mức</button></SectionHeading>
      <div className="ex-category-grid">{metrics.categorySpending.map(item=>{
        const limit=allBudgets.categories[item.id]??null,percent=pct(item.amount,limit),status=statusOf(item.amount,limit);
        return <article className="ex-category-card" key={item.id}><div className="ex-category-top"><span className={'ex-cat-icon tone-'+item.tone}><Icon name={item.icon}/></span><div><strong>{item.label}</strong><small>{item.hint}</small></div><span className={'ex-budget-badge ex-badge-'+status}>{percent===null?'Chưa đặt':Number.isFinite(percent)?percent+'%':'Vượt'}</span></div>
          <div className="ex-cat-values"><strong>{money(item.amount)}</strong><span>/ {limit===null?'Chưa đặt hạn mức':money(limit)}</span></div><Meter value={item.amount} limit={limit} small/>{status==='exceeded'&&<p className="ex-category-alert">Đã chạm hoặc vượt hạn mức tháng.</p>}{status==='warning'&&<p className="ex-category-warning">Cảnh báo: đã dùng ít nhất 80%.</p>}</article>;
      })}</div>
    </section>

    <div className="ex-lower-grid">
      <section className="ex-panel ex-activity"><SectionHeading eyebrow="04 / SPENDING PATTERN" title="Nhịp chi tiêu hằng ngày." sub={'Dữ liệu thực tế · '+monthLabel(month)}/>
        <DailyChart month={month} dailyRows={metrics.dailyRows}/>
        <div className="ex-chart-foot"><span>Ngày có phát sinh: <strong>{metrics.dailyRows.length}</strong></span><span>Ngày bất thường: <strong>{metrics.anomalies.length}</strong></span></div>
      </section>
      <section className="ex-panel ex-data-tools"><SectionHeading eyebrow="DATA & PRIVACY" title="Dữ liệu của bạn." sub="Lưu giao dịch ngay tại máy và sao lưu JSON trên Google Drive bằng cùng OAuth Client ID của Editor; thiết bị mới kết nối cùng tài khoản Drive sẽ tải lại dữ liệu."/>
        <div className="ex-tool-stack"><button className="ex-btn ex-btn-subtle" onClick={exportJson} type="button"><Icon name="download" size={17}/> Sao lưu tất cả (JSON)</button><button className="ex-btn ex-btn-subtle" onClick={exportCsv} type="button"><Icon name="download" size={17}/> Xuất giao dịch lọc (CSV)</button><button className="ex-btn ex-btn-subtle" onClick={()=>importRef.current?.click()} type="button"><Icon name="upload" size={17}/> Khôi phục từ JSON</button><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={importJson}/></div>
        <p className="ex-privacy-note"><Icon name="shield" size={15}/> Lưu local tức thì. Drive tự đồng bộ mỗi 3 phút khi trang đang mở, kèm nút Đồng bộ ngay. Phiên Google Drive hết hạn cần kết nối lại; hãy giữ file backup JSON cho thay đổi chưa được sao lưu.</p>
      </section>
    </div>

    <section className="ex-panel ex-feed"><SectionHeading eyebrow="05 / TRANSACTION FEED" title="Lịch sử từng ngày." sub={categoryFilter==='all'?'Toàn bộ giao dịch trong tháng '+monthLabel(month):'Đang lọc: '+(lookup.get(categoryFilter)?.label||'Danh mục')+' · '+monthLabel(month)}>
      <span className="ex-count">{selectedItems.length} giao dịch</span></SectionHeading>
      {grouped.length?grouped.map(([date,items])=><div className="ex-day-group" key={date}><h3>{date===today?'Hôm nay':date===yesterday(today)?'Hôm qua':displayDate(date)} <span>{items.length} khoản</span>{metrics.anomalies.some(row=>row.date===date)&&<span className="ex-anomaly"><Icon name="alert" size={13}/> Chi đột biến</span>}</h3>
      {items.map(tx=>{const category=lookup.get(tx.categoryId);return <div className="ex-tx" key={tx.id}>
        <span className={'ex-cat-icon tone-'+(category?.tone||'custom')}><Icon name={category?.icon||'tag'}/></span><div className="ex-tx-details"><strong>{tx.note||category?.label||'Chi tiêu'}</strong><small>{category?.label||'Danh mục không xác định'} · {displayDate(tx.date)}</small></div><strong className="ex-tx-amount">−{money(tx.amount)}</strong><div className="ex-tx-buttons"><button onClick={()=>edit(tx)} type="button" title="Sửa giao dịch" aria-label={'Sửa khoản '+money(tx.amount)}><Icon name="edit" size={16}/></button><button onClick={()=>remove(tx)} type="button" title="Xóa giao dịch" aria-label={'Xóa khoản '+money(tx.amount)}><Icon name="trash" size={16}/></button></div>
      </div>;})}</div>):<div className="ex-empty"><span className="ex-empty-icon"><Icon name="receipt" size={28}/></span><h3>Chưa có giao dịch phù hợp.</h3><p>Hãy ghi lại một khoản chi để bắt đầu theo dõi ngân sách.</p></div>}
      {selectedItems.length>visibleItems.length&&<button className="ex-btn ex-btn-subtle ex-more" onClick={()=>setFeedLimit(n=>n+30)} type="button">Xem thêm giao dịch ({selectedItems.length-visibleItems.length} còn lại) <Icon name="chevron" size={16}/></button>}
    </section>
    <footer className="ex-footer"><span>© 2026 Duy Nguyen · Daily Expenses &amp; Insights</span><span>Personal finance · Emerald light design · Số liệu từ giao dịch đã lưu</span></footer>
  </div></div>;
}

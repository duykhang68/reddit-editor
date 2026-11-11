import React,{useEffect,useMemo,useRef,useState,useCallback} from 'react';
import {useEditor,EditorContent} from '@tiptap/react';
import SchedulePost from './components/SchedulePost.jsx';
import ScheduledQueue from './components/ScheduledQueue.jsx';
import {localTimeZone,scheduleLabel,loadScheduleCache,storeScheduleCache} from './services/schedule.js';
import StarterKit from '@tiptap/starter-kit';
import {TableKit} from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import {api} from './api.js';
import DrivePanel from './DrivePanel.jsx';
import PostLibrary from './PostLibrary.jsx';
import DiagramStudio from './DiagramStudio.jsx';
import {Callout} from './Callout.js';
import {ArticleBlocks,BLOCKS,blockHTML} from './ArticleBlocks.js';
import articleStyles from './article.css?inline';
import {marked} from 'marked';
import DOMPurify from 'dompurify';
import SeriesEditorPanel from './components/SeriesEditorPanel.jsx';
import BlueprintSelector from './components/BlueprintSelector.jsx';
import SeriesIndexTable from './components/SeriesIndexTable.jsx';
import {emptySeries, editableSeries, extractSeriesFromHTML, withSeriesHTML, normalizeSeries, seriesValidation} from './services/series.js';
import './components/series.css';

const EDITOR_QUICK_LINKS = [
  {title: 'Tet Dinh Mui · Cashflow Intelligence', description: 'Telegram giao dịch ngân hàng, dòng tiền riêng tư và Smart Insights Cloudflare.', href: '/cashflow-intelligence/', symbol: '₫', accent: 'expenses'},
  {title: 'GA4 Insights · Blog Analytics', description: 'Số liệu Google Analytics 4 của blog: người dùng, nguồn truy cập, bài viết và thiết bị.', href: '/ga4-insights/', symbol: '↗', accent: 'expenses'},
  {title: 'Voice Studio · Text to WAV', description: 'Tạo giọng thuyết minh từ văn bản bằng Azure, Gemini hoặc Groq và xuất WAV.', href: '/voice-studio/', symbol: '◉', accent: 'expenses'},
  {title: 'TypesettingTools · Subtitle & Karaoke', description: 'Căn timing phụ đề, karaoke và xuất SRT, VTT, ASS, LRC.', href: '/typesetting-tools/', symbol: '♫', accent: 'expenses'},
  {title: 'YouTube Subtitle AI Writer · Việt Hàn Anh', description: 'Dán phụ đề YouTube để AI viết bài, xếp hàng thực thi, lưu Drive và đồng bộ từ vựng.', href: '/youtube-subtitle-writer/', symbol: '▶', accent: 'expenses'},
  {title: 'Wikipedia AI Writer · Việt Hàn Anh', description: 'Viết bài từ Wikipedia bằng Gemini/Groq và đồng bộ từ vựng vào Google Sheets.', href: '/wikipedia-writer/', symbol: '✦', accent: 'expenses'},
  {title: 'Rollback ID Dashboard', description: 'Theo dõi lịch sử deploy và thao tác rollback an toàn từ GitHub.', href: '/rollback-dashboard/', symbol: '↶', accent: 'expenses'},
  {title: 'Vietnamese · Korean · English Vocabulary Insights', description: 'Từ điển ba ngôn ngữ, Smart Insights và flashcard đồng bộ Google Sheets.', href: '/vocabulary-insights/', symbol: '文', accent: 'expenses'},
  {title: 'Starbucks Rewards & Insights', description: 'Theo dõi chi tiêu và tiến độ tích Stars.', href: '/starbucks-insights/', symbol: '☕', accent: 'starbucks'},
  {title: 'Highlands Rewards & Insights', description: 'Chi tiêu Highlands, đọc hóa đơn POS và DRIPS HighlandsĐI.', href: '/highlands-insights/', symbol: '◉', accent: 'highlands'},
  {title: 'Payroll & C&B Insights', description: 'Import bảng lương PDF, phân tích công thức Excel và tra cứu C&B.', href: '/payroll-insights/', symbol: '₫', accent: 'payroll'},
  {title: 'Daily Expenses & Insights', description: 'Ghi chi tiêu, hạn mức danh mục và phân tích ngân sách tháng.', href: '/expenses/', symbol: '◉', accent: 'expenses'}
];

const DEFAULT_HTML='<h2>Giới thiệu</h2><p>Bắt đầu viết bài tại đây…</p>';
const fmt=d=>d?new Date(d).toLocaleString('vi-VN'):'';
function localKey(blogId){return 'dn-reddit-editor-local-v1-'+(blogId||'new');}
function validWebUrl(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol);}catch{return false;}}
function Icon({name}){const icons={edit:'✎',link:'↗',save:'✓',refresh:'↻',logout:'⎋',image:'▣',code:'⌘',table:'▦',new:'+',check:'✓',cloud:'☁',file:'▤',arrow:'↑'};return <span aria-hidden="true">{icons[name]||'•'}</span>;}
function Tool({label,onClick,active=false,disabled=false,title}){return <button className={'tool '+(active?'selected':'')} disabled={disabled} type="button" onClick={onClick} title={title||label} aria-label={title||label}>{label}</button>;}
function Ribbon({editor}){
  const [tick,setTick]=useState(0);
  useEffect(()=>{if(!editor)return;const update=()=>setTick(n=>n+1);editor.on('transaction',update);return()=>editor.off('transaction',update);},[editor]);
  void tick;
  if(!editor)return null;
  const run=fn=>()=>fn();
  const link=()=>{const curr=editor.getAttributes('link').href||'https://';const value=prompt('Dán URL liên kết (https://...)',curr);if(value===null)return;if(!value.trim())return editor.chain().focus().unsetLink().run();if(!validWebUrl(value))return alert('Chỉ hỗ trợ URL http(s).');editor.chain().focus().extendMarkRange('link').setLink({href:value}).run();};
  const image=()=>{const url=prompt('URL ảnh công khai https://... (Blogger API không hỗ trợ upload ảnh trực tiếp)');if(!url)return;if(!validWebUrl(url))return alert('URL phải bắt đầu bằng https:// hoặc http://');const alt=prompt('Mô tả ảnh (alt)', '')||'';editor.chain().focus().setImage({src:url,alt}).run();};
  return <div className="toolbar" role="toolbar" aria-label="Định dạng bài viết">
    <Tool label="B" title="In đậm" active={editor.isActive('bold')} onClick={run(()=>editor.chain().focus().toggleBold().run())}/>
    <Tool label="I" title="In nghiêng" active={editor.isActive('italic')} onClick={run(()=>editor.chain().focus().toggleItalic().run())}/>
    <Tool label="U" title="Gạch dưới" active={editor.isActive('underline')} onClick={run(()=>editor.chain().focus().toggleUnderline().run())}/>
    <Tool label="S̶" title="Gạch ngang" active={editor.isActive('strike')} onClick={run(()=>editor.chain().focus().toggleStrike().run())}/>
    <span className="tool-divider"/>
    <Tool label="H2" active={editor.isActive('heading',{level:2})} onClick={run(()=>editor.chain().focus().toggleHeading({level:2}).run())}/>
    <Tool label="H3" active={editor.isActive('heading',{level:3})} onClick={run(()=>editor.chain().focus().toggleHeading({level:3}).run())}/>
    <Tool label="• List" active={editor.isActive('bulletList')} onClick={run(()=>editor.chain().focus().toggleBulletList().run())}/>
    <Tool label="1. List" active={editor.isActive('orderedList')} onClick={run(()=>editor.chain().focus().toggleOrderedList().run())}/>
    <Tool label="❝ Quote" active={editor.isActive('blockquote')} onClick={run(()=>editor.chain().focus().toggleBlockquote().run())}/>
    <Tool label="⌘ Code" active={editor.isActive('codeBlock')} onClick={run(()=>editor.chain().focus().toggleCodeBlock().run())}/>
    <span className="tool-divider"/>
    <Tool label="↗ Link" onClick={link}/><Tool label="▣ Ảnh" onClick={image}/>
    <Tool label="Tx" title="Xóa định dạng" onClick={run(()=>editor.chain().focus().unsetAllMarks().clearNodes().run())}/>
    <span className="tool-divider"/>
    <Tool label="↶" title="Hoàn tác" disabled={!editor.can().undo()} onClick={run(()=>editor.chain().focus().undo().run())}/>
    <Tool label="↷" title="Làm lại" disabled={!editor.can().redo()} onClick={run(()=>editor.chain().focus().redo().run())}/>
  </div>;
}
function Preview({title,html}){
  const page=`<!doctype html><html lang="vi"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:white}${articleStyles}</style></head><body class="article-content"><h1>${title.replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}</h1>${html}</body></html>`;
  return <iframe title="Xem trước (JavaScript bị vô hiệu hóa)" className="preview-frame" sandbox="" srcDoc={page}/>;
}
export default function App(){
  const [status,setStatus]=useState(null);
  const [documentKey,setDocumentKey]=useState(0),[driveBusy,setDriveBusy]=useState(false);
  const [blogs,setBlogs]=useState([]),[blogId,setBlogId]=useState('');
  const [items,setItems]=useState([]),[filter,setFilter]=useState('draft'),[nextPage,setNextPage]=useState(null);
  const [title,setTitle]=useState(''),[labels,setLabels]=useState(''),[html,setHTML]=useState(DEFAULT_HTML);
  const [series,setSeries]=useState(emptySeries);
  const [seriesPosts,setSeriesPosts]=useState([]),[seriesLoading,setSeriesLoading]=useState(false),[seriesPartial,setSeriesPartial]=useState(false),[seriesFault,setSeriesFault]=useState('');
  const [seriesCursors,setSeriesCursors]=useState({draftToken:'',liveToken:''});
  const [post,setPost]=useState(null),[mode,setMode]=useState('compose');
  const [scheduleOpen,setScheduleOpen]=useState(false),[scheduleBusy,setScheduleBusy]=useState(false);
  const [scheduleHistory,setScheduleHistory]=useState([]),[driveSchedule,setDriveSchedule]=useState(null);
  const [scheduledQueueRevision,setScheduledQueueRevision]=useState(0);
  const [dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[autoSync,setAutoSync]=useState(true);
  const [message,setMessage]=useState(''),[fault,setFault]=useState(''),[busy,setBusy]=useState(false);
  const [restorable,setRestorable]=useState(null);
  const [communityOpen,setCommunityOpen]=useState(false),[communitySearch,setCommunitySearch]=useState('');
  const [draftsOpen,setDraftsOpen]=useState(false),[tagsOpen,setTagsOpen]=useState(false);
  const [diagramOpen,setDiagramOpen]=useState(false),[diagramAuto,setDiagramAuto]=useState(false);
  const sourceRef=useRef(null),previewFrom=useRef('compose');
  const suppress=useRef(false),inflight=useRef(false),editorCurrent=useRef(null),revision=useRef(0);
  const seriesRequest=useRef(0);
  const editor=useEditor({
    extensions:[StarterKit.configure({heading:{levels:[2,3]},link:{openOnClick:false,defaultProtocol:'https'}}),TableKit,Image.configure({allowBase64:false}),Callout,...ArticleBlocks],
    content:DEFAULT_HTML,
    onUpdate:({editor:instance})=>{if(suppress.current)return;setHTML(instance.getHTML());revision.current++;setDirty(true);setMessage('Có thay đổi mới; chọn nơi lưu bài viết');}
  });
  editorCurrent.current=editor;
  const connected=!!status?.connected;
  const scheduled=String(post?.status||'').toLowerCase()==='scheduled';
  const readOnly=!!post&&String(post.status||'').toLowerCase()==='scheduled';
  const isPublished=String(post?.status||'').toLowerCase()==='live';
  const currentSchedule=scheduled&&post?.published?{publishDate:post.published,timeZone:localTimeZone()}:driveSchedule;
  useEffect(()=>{setScheduleHistory(loadScheduleCache(blogId));},[blogId]);
  useEffect(()=>{editor?.setEditable(!readOnly,false);},[editor,readOnly]);
  const wordCount=useMemo(()=>html.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/g,' ').trim().split(/\s+/).filter(Boolean).length,[html]);
  const labelsArray=useMemo(()=>[...new Set(labels.split(',').map(x=>x.trim()).filter(Boolean))],[labels]);
  const activeSeries=useMemo(()=>normalizeSeries(series),[series]);
  const seriesIssue=seriesValidation(series);
  const updateSeries=next=>{revision.current++;setSeries(next);setDirty(true);setMessage('Đã thay đổi Series; cần lưu lại bài viết.');};
  useEffect(()=>{seriesRequest.current++;setSeriesPosts([]);setSeriesPartial(false);setSeriesCursors({draftToken:'',liveToken:''});setSeriesFault('');setSeriesLoading(false);},[blogId,series.enabled,series.name]);
  const fetchSeriesPage=async(append=false)=>{
    if(!activeSeries||!connected||!blogId)return;
    const requestId=++seriesRequest.current;
    setSeriesLoading(true);setSeriesFault('');
    try{
      const params=new URLSearchParams({blogId,name:activeSeries.name});
      if(append){params.set('draftToken',seriesCursors.draftToken||'done');params.set('liveToken',seriesCursors.liveToken||'done');}
      const data=await api('/series?'+params);
      if(requestId!==seriesRequest.current)return;
      setSeriesPosts(previous=>{
        if(!append)return data.posts||[];
        const entries=new Map(previous.map(item=>[String(item.id),item]));
        for(const item of data.posts||[])entries.set(String(item.id),item);
        return [...entries.values()];
      });
      setSeriesCursors({draftToken:data.nextDraftToken||'done',liveToken:data.nextLiveToken||'done'});
      setSeriesPartial(!!data.partial);
    }catch(e){if(requestId===seriesRequest.current)setSeriesFault(e.message||String(e));}
    finally{if(requestId===seriesRequest.current)setSeriesLoading(false);}
  };
  const refreshSeries=()=>fetchSeriesPage(false);
  const resetFault=()=>setFault('');
  const showError=e=>{setFault(e.message||String(e));setMessage('Lỗi');};
  const init=useCallback(async()=>{try{const s=await api('/status');setStatus(s);if(s.connected){const b=await api('/blogs');setBlogs(b.blogs);const configured=b.blogs.some(x=>x.id===s.defaultBlogId)?s.defaultBlogId:b.blogs[0]?.id||'';setBlogId(configured);}}catch{setStatus({connected:false});}},[]);
  useEffect(()=>{init();},[init]);
  useEffect(()=>{
    try{const d=JSON.parse(localStorage.getItem(localKey(blogId))||'null');if(d?.dirty&&(d.title||d.html))setRestorable(d);else setRestorable(null);}catch{setRestorable(null);}
  },[blogId]);
  const fetchPosts=useCallback(async(statusFilter=filter,append=false,token='')=>{
    if(!blogId||!connected)return;
    setBusy(true);resetFault();
    try{const p=new URLSearchParams({blogId,status:statusFilter});if(token)p.set('pageToken',token);const result=await api('/posts?'+p);
      setItems(prev=>append?[...prev,...result.posts]:result.posts);setNextPage(result.nextPageToken);
      if(statusFilter==='scheduled'){
        setScheduleHistory(previous=>{
          const merged=append?[...previous,...result.posts]:result.posts;
          const unique=[...new Map(merged.map(p=>[String(p.id),{id:String(p.id),title:p.title,publishDate:p.published,status:p.status}])).values()];
          storeScheduleCache(blogId,unique);
          return unique;
        });
      }
    }catch(e){showError(e);}finally{setBusy(false);}
  },[blogId,filter,connected]);
  useEffect(()=>{if(blogId&&connected){setItems([]);setNextPage(null);fetchPosts(filter);}},[blogId,filter,connected,fetchPosts]);
  useEffect(()=>{
    if(restorable)return;
    const t=setTimeout(()=>{
      try{localStorage.setItem(localKey(blogId),JSON.stringify({post,title,labels,html,series,driveSchedule,dirty,savedAt:new Date().toISOString()}));}catch{setMessage('Bộ nhớ thiết bị đầy; hãy lưu lên Blogger');}
    },800);return()=>clearTimeout(t);
  },[blogId,post,title,labels,html,series,driveSchedule,dirty,restorable]);
  const setEditorHTML=value=>{if(editorCurrent.current){suppress.current=true;editorCurrent.current.commands.setContent(value);suppress.current=false;}};
  const loadLocal=()=>{if(driveBusy||saving||!restorable)return;setDocumentKey(k=>k+1);revision.current++;setPost(restorable.post||null);setDriveSchedule(restorable.driveSchedule||null);setTitle(restorable.title||'');setLabels(restorable.labels||'');setSeries(restorable.series?.enabled?editableSeries(restorable.series):emptySeries());setHTML(restorable.html||DEFAULT_HTML);setEditorHTML(restorable.html||DEFAULT_HTML);setMode('html');setDirty(true);setRestorable(null);setMessage('Đã khôi phục bản lưu cục bộ; cần kiểm tra trước khi lưu lên Blogger');};
  const newPost=()=>{if(driveBusy||saving)return;if(dirty&&!confirm('Nội dung chưa lưu lên Blogger. Vẫn tạo bài mới?'))return;setDocumentKey(k=>k+1);revision.current++;setPost(null);setDriveSchedule(null);setTitle('');setLabels('');setSeries(emptySeries());setHTML(DEFAULT_HTML);setEditorHTML(DEFAULT_HTML);setMode('compose');setDirty(false);setMessage('Bài mới: chưa lưu lên Blogger');setFault('');};
  const openPost=async p=>{
    if(driveBusy||saving)return;
    if(dirty&&!confirm('Bài hiện tại chưa lưu trên Blogger. Vẫn mở bài khác?'))return;
    setBusy(true);resetFault();
    try{const x=await api(`/posts/${p.id}?blogId=${encodeURIComponent(blogId)}`);setDocumentKey(k=>k+1);revision.current++;setPost(x.post);setDriveSchedule(String(x.post.status||'').toLowerCase()==='scheduled'?{publishDate:x.post.published,timeZone:localTimeZone()}:null);setTitle(x.post.title);setLabels((x.post.labels||[]).join(', '));const opened=extractSeriesFromHTML(x.post.content);setSeries(opened.series);setHTML(opened.html);setEditorHTML(opened.html);setDirty(false);setMode('html');setMessage('Đã tải bài từ Blogger. Mở HTML để giữ nguyên các khối cũ; chỉ chuyển sang Compose nếu chấp nhận chuẩn hóa HTML.');setRestorable(null);}
    catch(e){showError(e);}finally{setBusy(false);setDraftsOpen(false);}
  };
  const save=async({silent=false}={})=>{
    if(inflight.current)return null;
    if(!connected)return showError(new Error('Kết nối Google trước khi lưu'));
    if(!blogId)return showError(new Error('Chưa chọn blog'));
    if(readOnly)return showError(new Error('Hãy hủy lịch bài đang lên lịch trước khi sửa.'));
    if(!title.trim())return showError(new Error('Nhập tiêu đề bài viết trước khi lưu'));
    if(seriesIssue)return showError(new Error('Series: '+seriesIssue));
    inflight.current=true;const revisionOnSend=revision.current;setSaving(true);resetFault();setMessage('Đang lưu Blogger...');
    const payload={blogId,title,content:withSeriesHTML(html,series),labels:labelsArray};
    try{
      const result=post?await api(`/${isPublished?'posts':'drafts'}/${post.id}`,{method:'PATCH',body:{...payload,expectedUpdated:post.updated},csrf:status.csrf}):await api('/drafts',{method:'POST',body:payload,csrf:status.csrf});
      setPost(result.post);if(revision.current===revisionOnSend){setDirty(false);setMessage('Đã lưu bản nháp trên Blogger lúc '+new Date().toLocaleTimeString('vi-VN'));}else{setDirty(true);setMessage('Đã lưu phiên bản trước; có thay đổi mới cần đồng bộ tiếp.');}
      if(!silent){if(isPublished){if(filter==='live')fetchPosts('live');else setFilter('live');}else if(filter==='draft')fetchPosts('draft');else setFilter('draft');}return result.post;
    }catch(e){showError(e);return null;}finally{inflight.current=false;setSaving(false);}
  };
  useEffect(()=>{
    if(driveBusy||!autoSync||!dirty||!post||String(post.status||'').toLowerCase()!=='draft'||mode!=='compose'||!!seriesIssue||!navigator.onLine)return;
    const timer=setTimeout(()=>{if(!inflight.current)save({silent:true});},5000);
    return()=>clearTimeout(timer);
  },[driveBusy,autoSync,dirty,post?.id,post?.updated,title,labels,html,series,mode,seriesIssue]);
  const publish=async()=>{
    if(!connected||!blogId||!post||isPublished)return alert('Chỉ có thể xuất bản bản nháp chưa đăng.');
    if(!confirm('XUẤT BẢN công khai bài viết này lên Blogger? Hành động này không thể hoàn tác bằng nút Undo.'))return;
    let target=post;
    if(dirty){target=await save();if(!target)return;}
    setSaving(true);resetFault();
    try{const result=await api(`/publish/${target.id}`,{method:'POST',body:{blogId,expectedUpdated:target.updated},csrf:status.csrf});setPost(result.post);setDriveSchedule(null);setDirty(false);setMessage('Đã xuất bản thành công. '+(result.post.url||''));setFilter('live');}
    catch(e){showError(e);}finally{setSaving(false);}
  };
  const scheduleArticle=async({publishDate,timeZone})=>{
    if(!connected||!blogId)throw new Error('Kết nối Blogger và chọn blog trước khi đặt lịch.');
    if(isPublished)throw new Error('Không thể đặt lịch lại bài đã xuất bản.');
    if(!title.trim())throw new Error('Nhập tiêu đề trước khi đặt lịch.');
    if(seriesIssue)throw new Error('Series: '+seriesIssue);
    let target=post;
    if(!target||dirty){target=await save();if(!target)throw new Error('Không lưu được bản nháp; chưa tạo lịch đăng.');}
    setScheduleBusy(true);setSaving(true);resetFault();
    try{
      const result=await api('/schedule/'+target.id,{method:'POST',
        body:{blogId,expectedUpdated:target.updated,publishDate},csrf:status.csrf});
      setPost(result.post);setDriveSchedule({publishDate:result.post.published||publishDate,timeZone});setDirty(false);
      setMessage('Đã đặt lịch xuất bản: '+scheduleLabel(result.post.published||publishDate,timeZone));
      setScheduleHistory(previous=>{
        const next=[{id:String(result.post.id),title:result.post.title,publishDate:result.post.published||publishDate,status:'scheduled'},...previous.filter(x=>String(x.id)!==String(result.post.id))];
        storeScheduleCache(blogId,next);return next;
      });
      setScheduledQueueRevision(n=>n+1);
      if(filter==='scheduled')fetchPosts('scheduled');else setFilter('scheduled');
      return true;
    }catch(e){showError(e);throw e;}finally{setSaving(false);setScheduleBusy(false);}
  };
  const cancelSchedule=async()=>{
    if(!post||!scheduled)throw new Error('Bài viết hiện không có lịch đăng.');
    if(!confirm('Hủy lịch đăng? Bài viết sẽ trở về bản nháp và không tự xuất bản.'))return false;
    setScheduleBusy(true);setSaving(true);resetFault();
    try{
      const result=await api('/schedule/'+post.id,{method:'DELETE',
        body:{blogId,expectedUpdated:post.updated},csrf:status.csrf});
      setPost(result.post);setDriveSchedule(null);setDirty(false);setMessage('Đã hủy lịch. Bài trở về bản nháp trên Blogger.');
      setScheduleHistory(previous=>{const next=previous.filter(x=>String(x.id)!==String(post.id));storeScheduleCache(blogId,next);return next;});
      setScheduledQueueRevision(n=>n+1);
      setFilter('draft');return true;
    }catch(e){showError(e);throw e;}finally{setSaving(false);setScheduleBusy(false);}
  };
  const convertToCompose=()=>{
    if(!confirm('Compose có thể bỏ các thẻ HTML không được TipTap hỗ trợ. Hãy giữ HTML view khi chỉnh bài cũ có widget/iframe/code tùy biến. Tiếp tục?'))return;
    setEditorHTML(html);setMode('compose');
    // Use normalized editor HTML only after a deliberate mode conversion.
    const normalized=editorCurrent.current?.getHTML()||html;if(normalized!==html){revision.current++;setHTML(normalized);setDirty(true);}
  };
  const changeMode=next=>{
    if(next===mode)return;
    if(next==='preview')previewFrom.current=mode;
    if(next==='compose'&&mode==='preview'&&previewFrom.current==='html')return convertToCompose();
    if(next==='compose'&&mode==='html')return convertToCompose();
    if(next==='html'&&mode==='compose'){setHTML(editor?.getHTML()||html);setMode(next);return;}
    setMode(next);
  };
  const logout=async()=>{if(!confirm('Ngắt kết nối tài khoản Google trên ứng dụng này?'))return;try{await api('/logout',{method:'POST',csrf:status.csrf});setStatus(null);setBlogs([]);setBlogId('');setPost(null);setItems([]);await init();}catch(e){showError(e);}};
  const download=()=>{const blob=new Blob([html],{type:'text/html;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(title||'draft').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]/gi,'-').slice(0,65)+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  const currentBlog=blogs.find(b=>b.id===blogId);
  const copyHTML=async()=>{
    try{await navigator.clipboard.writeText(html);setMessage('Đã sao chép HTML bài viết.');}
    catch{changeMode('html');setMessage('Chọn mã HTML và nhấn Ctrl+C để sao chép.');setTimeout(()=>sourceRef.current?.select(),0);}
  };
  const insertBlock=kind=>{
    if(readOnly||mode==='preview'||!editor)return;
    const values={};
    if(kind==='image'||kind==='cta'){
      const url=prompt(kind==='image'?'URL ảnh công khai (https://...)':'URL liên kết (https://...)','https://');
      if(url===null)return;if(!validWebUrl(url.trim()))return alert('URL phải bắt đầu bằng https:// hoặc http://');
      values.url=url.trim();
      if(kind==='image'){values.alt=prompt('Mô tả ảnh (alt)','')||'';values.caption=prompt('Chú thích hình ảnh','')||'';}
      else values.label=prompt('Nội dung nút liên kết','Tìm hiểu thêm')||'Tìm hiểu thêm';
    }
    const markup=blockHTML(kind,values)+'<p></p>';
    if(mode==='html'){
      const start=sourceRef.current?.selectionStart??html.length,end=sourceRef.current?.selectionEnd??start;
      setHTML(html.slice(0,start)+markup+html.slice(end));revision.current++;setDirty(true);
      setTimeout(()=>{sourceRef.current?.focus();sourceRef.current?.setSelectionRange(start+markup.length,start+markup.length);},0);
    }else editor.chain().focus().insertContent(markup).run();
    setMessage('Đã thêm khối '+(BLOCKS.find(b=>b[0]===kind)?.[2]||'nội dung')+'.');
  };
  const insertBlueprint=markdown=>{
    if(readOnly||saving||driveBusy||mode==='preview'||!markdown?.trim())return;
    const markup=DOMPurify.sanitize(marked.parse(markdown),{FORBID_TAGS:['script','style','iframe','object','embed']});
    if(mode==='html'){
      const start=sourceRef.current?.selectionStart??html.length,end=sourceRef.current?.selectionEnd??start;
      const insert='\n'+markup+'\n';
      setHTML(html.slice(0,start)+insert+html.slice(end));revision.current++;setDirty(true);
      setTimeout(()=>{sourceRef.current?.focus();sourceRef.current?.setSelectionRange(start+insert.length,start+insert.length);},0);
    }else if(editor){
      editor.chain().focus('end').insertContent('<p></p>'+markup).run();
    }
    setMessage('Đã chèn dàn ý Series vào nội dung bài viết.');
  };
  const selectBlog=id=>{
    if(driveBusy||saving)return;
    if(id===blogId){setCommunityOpen(false);return;}
    if(dirty&&!confirm('Nội dung chưa lưu lên Blogger. Đổi blog và bỏ thay đổi này?'))return;
    setDocumentKey(k=>k+1);revision.current++;setBlogId(id);setPost(null);setDriveSchedule(null);setTitle('');setLabels('');setSeries(emptySeries());setHTML(DEFAULT_HTML);
    setEditorHTML(DEFAULT_HTML);setDirty(false);setMode('compose');setCommunityOpen(false);
  };
  const allSeriesPosts=activeSeries ? [
    ...seriesPosts.filter(item=>String(item.id)!==String(post?.id||'')),
    {id:post?.id||'unsaved-current',title:title||'Bài đang soạn',url:post?.url||'',status:post?.status||'DRAFT',series:activeSeries}
  ] : [];
  return <div className={'app reddit-layout'+' kit-layout'}>
    <header className="topbar reddit-topbar">
      <div className="brand"><span className="brandmark">d.</span><div><strong>Duy Nguyen <em>Editor</em></strong><small>Reddit-inspired · Blogger CMS</small></div></div>
      <div className="top-actions"><span className={'conn '+(connected?'online':'')}>{connected?'● Blogger đã kết nối':'○ Chưa kết nối'}</span>{connected?<button className="quiet" onClick={logout}>Ngắt kết nối</button>:<a className="primary" href="/auth/google/start">Kết nối Blogger ↗</a>}</div>
    </header>
    <SchedulePost open={scheduleOpen} post={post} title={title} busy={scheduleBusy||saving||driveBusy}
      onClose={()=>setScheduleOpen(false)} onSchedule={scheduleArticle} onCancel={cancelSchedule}/>
    {diagramOpen&&<DiagramStudio autoStart={diagramAuto} sourceHTML={html} sourceTitle={title} onClose={()=>setDiagramOpen(false)}/>}
    <main className="kit-main">
      <div className="kit-page-head">
        <div><div className="kit-eyebrow">EDITOR KIT <span>/</span> BLOGGER &amp; DRIVE</div><h1>Không gian viết của bạn<span>.</span></h1><p>Một ý tưởng hay, một bài viết chỉn chu.</p></div>
        <div className="kit-page-actions"><button className="kit-button" onClick={()=>{setDiagramAuto(false);setDiagramOpen(true);}}>◇ Sơ đồ</button><button className="kit-button" onClick={()=>{setDiagramAuto(true);setDiagramOpen(true);}}>✦ Auto Visualize</button><button className="kit-button" onClick={()=>changeMode(mode==='preview'?previewFrom.current:'preview')} aria-pressed={mode==='preview'}><span aria-hidden="true">◉</span> {mode==='preview'?'Quay lại viết':'Xem trước'}</button><button className="kit-button" onClick={download}><span aria-hidden="true">↓</span> Lưu HTML</button><button className="kit-button kit-copy" onClick={copyHTML}><span aria-hidden="true">⧉</span> Sao chép HTML</button></div>
      </div>
      <nav className="kit-navigation" aria-label="Điều hướng trình soạn thảo">
        <button disabled={!connected||driveBusy} className="community-trigger" onClick={()=>{setCommunitySearch('');setCommunityOpen(true);}} aria-expanded={communityOpen}><span className="kit-blog-dot" aria-hidden="true">{(currentBlog?.name||'B')[0].toUpperCase()}</span><span className="kit-selected-blog">{currentBlog?.name||'Blogger chưa kết nối'}</span><span aria-hidden="true">⌄</span></button>
        <div className="kit-navigation-actions"><button disabled={!connected||driveBusy} className="drafts-link" onClick={()=>setDraftsOpen(true)}>▤ &nbsp; Drafts &amp; Posts <span className="drafts-count">{items.length}{nextPage?'+':''}</span></button><button disabled={driveBusy} className="kit-button" onClick={newPost}>＋ Bài viết mới</button></div>
      </nav>
      {restorable&&<div className="alert restore"><strong>Bản lưu cục bộ: {fmt(restorable.savedAt)}</strong><span>Kiểm tra nội dung trước khi đưa lên Blogger.</span><button className="quiet" onClick={loadLocal}>Khôi phục</button><button className="quiet" onClick={()=>{localStorage.removeItem(localKey(blogId));setRestorable(null);}}>Bỏ qua</button></div>}
      {readOnly&&<div className="alert warning">{scheduled?'Bài đang được Blogger lên lịch và ở chế độ chỉ xem. Chọn Đổi lịch / Hủy lịch để điều chỉnh; hủy lịch sẽ đưa bài về bản nháp.':'Bài đã xuất bản đang ở chế độ chỉ xem. Bạn có thể sao chép HTML hoặc tạo một bản nháp mới.'}</div>}
      {fault&&<div className="alert error" role="alert">{fault}</div>}
      <div className="kit-workspace">
        <aside className="kit-panel kit-blocks" aria-labelledby="blocks-heading">
          <div className="kit-panel-heading"><span className="kit-heading-mark" aria-hidden="true">▦</span><div><h2 id="blocks-heading">Thêm khối bài viết</h2><p>Một cú nhấp, thêm cảm hứng.</p></div></div>
          <div className="kit-block-list">{BLOCKS.map(([key,mark,label,description],i)=><React.Fragment key={key}>{i===5&&<div className="kit-block-category">NỘI DUNG PHONG PHÚ</div>}<button type="button" className={'kit-block-button kit-block-'+key} onClick={()=>insertBlock(key)} disabled={readOnly||mode==='preview'||!editor} title={description}><span className="kit-block-mark" aria-hidden="true">{mark}</span><span>{label}</span><span className="kit-block-plus" aria-hidden="true">＋</span></button></React.Fragment>)}</div>
          <div className="kit-block-foot">{readOnly?'Bài đã lên lịch đang ở chế độ chỉ xem.':mode==='preview'?'Quay lại Soạn thảo hoặc HTML để chèn khối.':'Đặt con trỏ trong bài, rồi chọn khối bạn muốn thêm.'}</div>
        </aside>
        <div className="kit-editor-stack">
        <section className="kit-paper" aria-label="Nội dung bài viết">
          <div className="kit-paper-meta"><span className="kit-paper-blog">r/{(currentBlog?.name||'Blogger').replace(/\s+/g,'')}</span><span className={'kit-state'+(scheduled?' is-scheduled':readOnly?' is-live':'')}>{scheduled?'⏱ Đã đặt lịch':readOnly?'Đã lên lịch':isPublished?'Bài đã xuất bản':post?'Bản nháp Blogger':'Bản nháp mới'}</span><span className="kit-meta-dot">·</span><span>{scheduled&&post.published?scheduleLabel(post.published):'Không gian cho ý tưởng của bạn'}</span></div>
          <div className="kit-title-area"><label className="kit-title-label" htmlFor="post-title">TIÊU ĐỀ BÀI VIẾT <span>{title.length}/200</span></label><textarea id="post-title" className="reddit-title" rows={2} value={title} maxLength={200} disabled={readOnly} onChange={e=>{revision.current++;setTitle(e.target.value);setDirty(true);}} placeholder="Bắt đầu bằng một tiêu đề hay…"/>
            <div className="tags-row"><button type="button" className="add-tags" disabled={readOnly} onClick={()=>setTagsOpen(v=>!v)} aria-expanded={tagsOpen}>♢ &nbsp; Thêm nhãn</button>{labelsArray.slice(0,20).map((x,i)=><span className={'tag tag'+(i%6)} key={x}>{x}</span>)}{!labelsArray.length&&<span className="kit-tags-hint">Giúp người đọc tìm thấy bài của bạn</span>}</div>
            {tagsOpen&&<div className="tag-panel"><label htmlFor="post-tags">Nhãn, ngăn cách bằng dấu phẩy</label><input id="post-tags" type="text" value={labels} disabled={readOnly} onChange={e=>{revision.current++;setLabels(e.target.value);setDirty(true);}} placeholder="Công nghệ, Hướng dẫn, SEO"/><button type="button" className="quiet" onClick={()=>setTagsOpen(false)}>Xong</button></div>}
          </div>
          <div className="kit-compose-head"><span className="kit-content-label">NỘI DUNG</span><div className="modes" role="group" aria-label="Chế độ soạn thảo">{['compose','html','preview'].map(m=><button key={m} className={mode===m?'active':''} aria-pressed={mode===m} onClick={()=>changeMode(m)}>{m==='compose'?'✎ Soạn thảo':m==='html'?'〈/〉 HTML':'◉ Xem trước'}</button>)}</div></div>
          {mode==='compose'&&<><fieldset className="kit-formatting" disabled={readOnly}><Ribbon editor={editor}/></fieldset><div className="kit-writing-area article-content"><EditorContent editor={editor}/></div></>}
          {mode==='html'&&<div className="source-area kit-source"><div className="hint">Chỉnh trực tiếp HTML. Bạn có thể chèn các khối mẫu tại vị trí con trỏ.</div><textarea ref={sourceRef} spellCheck={false} aria-label="Mã HTML bài viết" value={html} disabled={readOnly} onChange={e=>{revision.current++;setHTML(e.target.value);setDirty(true);}}/></div>}
          {mode==='preview'&&<Preview title={title||'Bài viết không tiêu đề'} html={html}/>}
          <div className={'kit-paper-status'+(dirty?' is-dirty':'')}>
            <div className="kit-save-status" role="status" aria-live="polite">
              <span className={'kit-status-dot'+(dirty?' is-dirty':'')} aria-hidden="true"/>
              <div className="kit-save-copy">
                <strong>{saving?'Đang lưu lên Blogger…':dirty?'Có thay đổi chưa lưu':post?'Đã đồng bộ với Blogger':'Sẵn sàng để viết'}</strong>
                <small>{message||'Lưu bản nháp khi bạn sẵn sàng.'}</small>
              </div>
            </div>
            <div className="kit-word-count" aria-label="Thống kê bài viết">
              <span className="kit-stat-pill"><strong>{wordCount.toLocaleString('vi-VN')}</strong><span>từ</span></span>
              <span className="kit-stat-pill"><strong>{Math.ceil(wordCount/200)}</strong><span>phút đọc</span></span>
            </div>
          </div>
        </section>
        <PostLibrary blogId={blogId} connected={connected} csrf={status?.csrf} posts={items} filter={filter} onFilter={setFilter}
          loading={busy} nextPage={nextPage} onRefresh={()=>fetchPosts(filter)} onMore={()=>fetchPosts(filter,true,nextPage)}
          onEdit={openPost} busyEditor={saving||driveBusy}
          onDeleted={async deletedId=>{
            if(String(post?.id)===String(deletedId)){setDocumentKey(k=>k+1);setPost(null);setDriveSchedule(null);setTitle('');setLabels('');setSeries(emptySeries());setHTML(DEFAULT_HTML);setEditorHTML(DEFAULT_HTML);setMode('compose');setDirty(false);setMessage('Bài đã xóa khỏi Blogger; bản sao lưu vẫn nằm trên Drive.');}
            await fetchPosts(filter);
          }}
          onRestore={savedPost=>{
            if(dirty&&!confirm('Bản đang sửa có thay đổi chưa lưu. Vẫn mở bản sao lưu thành bản nháp mới?'))return false;
            setDocumentKey(k=>k+1);revision.current++;setPost(null);setDriveSchedule(null);
            setTitle(savedPost.title||'');setLabels((savedPost.labels||[]).join(', '));
            const restored=extractSeriesFromHTML(savedPost.content||'');setSeries(restored.series);
            setHTML(restored.html);setEditorHTML(restored.html);setMode('html');setDirty(true);
            setRestorable(null);setMessage('Đã mở backup vào bản nháp mới. Kiểm tra rồi lưu lên Blogger; không tự xuất bản.');
            window.scrollTo({top:0,behavior:'smooth'});return true;
          }}/>
        <ScheduledQueue blogId={blogId} connected={connected} refreshKey={scheduledQueueRevision}
          onOpen={openPost} onViewAll={()=>{setFilter('scheduled');setDraftsOpen(true);}}/>
        </div>
        <aside className="kit-right" aria-label="Lưu và xuất bản">
          <SeriesEditorPanel value={series} onChange={updateSeries} disabled={readOnly||saving||driveBusy}/>
          {series.enabled&&<BlueprintSelector onInsert={insertBlueprint} disabled={readOnly||saving||driveBusy||mode==='preview'}/>}
          {activeSeries&&<>
            <SeriesIndexTable seriesName={activeSeries.name} currentPart={activeSeries.part} allSeriesPosts={allSeriesPosts}/>
            <div className="kit-series-refresh"><button type="button" className="kit-button full" onClick={refreshSeries} disabled={!connected||seriesLoading||driveBusy||saving}>{seriesLoading?'Đang tải mục lục…':'↻ Tải mục lục từ Blogger'}</button>
              {seriesPartial&&<button type="button" className="kit-button full" onClick={()=>fetchSeriesPage(true)} disabled={!connected||seriesLoading||driveBusy||saving}>{seriesLoading?'Đang tải…':'＋ Tải thêm tập'}</button>}
              {seriesFault&&<p className="series-error" role="alert">{seriesFault}</p>}
              {!connected&&<p className="series-note">Kết nối Blogger để xem các tập trên tài khoản của bạn.</p>}
            </div>
          </>}
          <DrivePanel key={documentKey} title={title} labels={labels} html={html} series={series} schedule={currentSchedule} dirty={dirty} onBusy={setDriveBusy} externalBusy={saving||busy} onOpen={article=>{revision.current++;setPost(null);setDriveSchedule(article.schedule||null);setTitle(article.title);setLabels(article.labels);setSeries(article.series?.enabled?editableSeries(article.series):emptySeries());setHTML(article.html);setEditorHTML(article.html);setMode('html');setDirty(true);setRestorable(null);setFault('');setMessage('Đã mở bài từ Drive. Lưu Drive và lưu Blogger là hai thao tác riêng.');}}/>
          <section className="kit-panel kit-publish-panel"><div className="kit-panel-heading"><span className="kit-heading-mark" aria-hidden="true">↗</span><div><h2>Đưa bài viết lên blog</h2><p>Từng bước, sẵn sàng chia sẻ.</p></div></div><div className="kit-panel-body">
            <div className="kit-destination"><span className="kit-destination-avatar" aria-hidden="true">{(currentBlog?.name||'B')[0].toUpperCase()}</span><div><span>BLOG CỦA BẠN</span><strong>{currentBlog?.name||'Chưa chọn blog'}</strong>{currentBlog?.url&&<a href={currentBlog.url} target="_blank" rel="noopener noreferrer">Mở blog ↗</a>}</div></div>
            <ol className="kit-publish-steps"><li className={title.trim()&&wordCount?'is-done':''}><span>{title.trim()&&wordCount?'✓':'1'}</span><div><strong>Viết điều bạn muốn kể</strong><p>Thêm tiêu đề, nội dung và nhãn.</p></div></li><li className={post&&!dirty?'is-done':''}><span>{post&&!dirty?'✓':'2'}</span><div><strong>Lưu bản nháp</strong><p>Giữ lại bài viết trên Blogger.</p></div></li><li className={readOnly?'is-done':''}><span>{readOnly?'✓':'3'}</span><div><strong>Chia sẻ với mọi người</strong><p>Xem trước rồi xác nhận xuất bản.</p></div></li></ol>
            <div className="kit-publish-actions"><button type="button" className="save" disabled={saving||driveBusy||readOnly||!blogId} onClick={()=>save()}>{saving?'Đang lưu…':isPublished?'✓ Cập nhật bài đã đăng':'✓ Lưu bản nháp'}</button><button type="button" className="publish" disabled={saving||driveBusy||!post||readOnly||isPublished} onClick={publish}>Xuất bản bài viết <span aria-hidden="true">↗</span></button><button type="button" className="schedule-button" disabled={saving||driveBusy||!blogId||isPublished||(!scheduled&&readOnly)} onClick={()=>setScheduleOpen(true)}>◷ {scheduled?'Thay đổi / Hủy lịch':'Schedule Post · Đặt lịch đăng'}</button></div>
            {scheduled&&post.published&&<div className="schedule-badge" role="status">◷ Scheduled for {scheduleLabel(post.published)}</div>}
            {!!scheduleHistory.length&&<div className="schedule-history"><h3>Scheduled Posts</h3><p>Lịch sử lưu trên thiết bị. Mở tab “Đã lên lịch” để xác minh từ Blogger.</p>{scheduleHistory.slice(0,3).map(item=><button type="button" key={item.id} onClick={()=>{setFilter('scheduled');setDraftsOpen(true);}}><strong>{item.title||'Không tiêu đề'}</strong><small>{scheduleLabel(item.publishDate)}</small></button>)}<button type="button" onClick={()=>{setFilter('scheduled');setDraftsOpen(true);}}>Xem toàn bộ lịch ↗</button></div>}
            <label className="kit-autosync"><span><input type="checkbox" checked={autoSync} onChange={e=>setAutoSync(e.target.checked)} disabled={readOnly}/> Tự động lưu nháp</span><small>Sau lần lưu đầu, tự đồng bộ khi soạn thảo.</small></label>
            {post&&<div className="kit-post-reference"><span>POST ID</span><code>{post.id}</code>{post.updated&&<small>Cập nhật: {fmt(post.updated)}</small>}</div>}
          </div></section>
          <section className="kit-panel kit-writing-tips"><div className="kit-panel-body"><div className="kit-tip-spark" aria-hidden="true">✦</div><h2>Chỉn chu từ những điều nhỏ</h2><p>Chia bài thành các đoạn ngắn. Dùng khối thông tin để làm rõ ý và thêm chú thích cho hình ảnh.</p><div className="kit-tip-tags"><span>Dễ đọc</span><span>Rõ ý</span><span>Có điểm nhấn</span></div><div className="kit-tip-divider"/><p className="kit-local-note">Bản đang viết được lưu cục bộ để bạn có thể khôi phục khi cần.</p></div></section>
        </aside>
      </div>
      <div className="kit-bottom-note"><span aria-hidden="true">✦</span> Dành thời gian cho câu chuyện. Để Editor lo phần trình bày.</div>
      
    </main>
    <nav className="kit-quick-links" aria-labelledby="editor-quick-links-heading">
      <div className="kit-quick-links-head">
        <div>
          <span className="kit-quick-links-eyebrow">DUY NGUYEN · WORKSPACE</span>
          <h2 id="editor-quick-links-heading">Truy cập nhanh<span>.</span></h2>
          <p>Mở các trang Insights của bạn chỉ với một cú nhấp.</p>
        </div>
        <span className="kit-quick-links-count">{EDITOR_QUICK_LINKS.length.toString().padStart(2, "0")} công cụ</span>
      </div>
      <div className="kit-quick-links-grid">
        {EDITOR_QUICK_LINKS.map(link=><a key={link.href} className={'kit-quick-link kit-quick-link-'+link.accent} href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.title+' (mở tab mới)'}>
          <span className="kit-quick-link-icon" aria-hidden="true">{link.symbol}</span>
          <span className="kit-quick-link-copy"><strong>{link.title}</strong><small>{link.description}</small></span>
          <span className="kit-quick-link-arrow" aria-hidden="true">↗</span>
        </a>)}
      </div>
    </nav>
    {connected&&draftsOpen&&<div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDraftsOpen(false);}}><aside className="drafts-drawer" role="dialog" aria-modal="true" aria-label="Danh sách bài viết"><div className="dialog-head"><h2>Drafts &amp; Posts</h2><button className="dialog-close" onClick={()=>setDraftsOpen(false)} aria-label="Đóng">✕</button></div><div className="side-tabs"><button className={filter==='draft'?'active':''} onClick={()=>setFilter('draft')}>Bản nháp</button><button className={filter==='live'?'active':''} onClick={()=>setFilter('live')}>Đã đăng</button><button className={filter==='scheduled'?'active':''} onClick={()=>setFilter('scheduled')}>Đã lên lịch</button></div><div className="postlist">{busy&&<p className="micro">Đang tải...</p>}{!busy&&!items.length&&<div className="empty">Chưa có bài phù hợp.</div>}{items.map(p=><button key={p.id} className={'postitem '+(post?.id===p.id?'current':'')} onClick={()=>openPost(p)}><span>{p.title||'Không tiêu đề'}</span><small>{filter==='scheduled'?'Đăng: '+scheduleLabel(p.published):fmt(p.updated)}</small></button>)}{nextPage&&<button className="quiet full" onClick={()=>fetchPosts(filter,true,nextPage)}>Tải thêm →</button>}</div><div className="drawer-foot"><button className="quiet" onClick={()=>fetchPosts(filter)}>↻ Làm mới</button><button className="primary" onClick={()=>{newPost();setDraftsOpen(false);}}>＋ Bài mới</button></div></aside></div>}
    {connected&&communityOpen&&<div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setCommunityOpen(false);}}><section className="community-dialog" role="dialog" aria-modal="true" aria-label="Choose blog"><div className="dialog-head"><h2>Choose blog</h2><button className="dialog-close" onClick={()=>setCommunityOpen(false)} aria-label="Đóng">✕</button></div><label className="search-wrap"><span aria-hidden="true">⌕</span><input autoFocus aria-label="Tìm blog" value={communitySearch} onChange={e=>setCommunitySearch(e.target.value)} placeholder="Search"/></label><p className="dialog-hint">Chọn blog Blogger của tài khoản Google đã kết nối</p><div className="community-list">{blogs.filter(b=>(b.name+' '+b.url).toLowerCase().includes(communitySearch.toLowerCase())).map(b=><button className="community-item" key={b.id} onClick={()=>selectBlog(b.id)}><span className="community-avatar">{(b.name||'B')[0].toUpperCase()}</span><span><strong>{b.name}</strong><small>{b.url||b.id}</small></span>{b.id===blogId&&<span className="current-check">✓</span>}</button>)}{!blogs.filter(b=>(b.name+' '+b.url).toLowerCase().includes(communitySearch.toLowerCase())).length&&<p className="empty">Không tìm thấy blog.</p>}</div></section></div>}
    <footer className="app-footer"><span>Duy Nguyen Editor · Lấy cảm hứng từ UI của Reddit, không liên kết với Reddit</span><span>Google OAuth → Blogger / Drive</span></footer>
  </div>;
}

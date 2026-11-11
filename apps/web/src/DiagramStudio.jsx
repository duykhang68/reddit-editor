import React, {useCallback, useEffect, useRef, useState} from 'react';
import './DiagramStudio.css';
import {findDiagramCandidates,makeDrawioXML} from './autoVisualize.js';

const ORIGIN = 'https://embed.diagrams.net';
const EMBED_URL = ORIGIN + '/?embed=1&proto=json&spin=1&ui=kennedy&noExitBtn=1';
const STORE = 'dn-diagram-studio-v1';
const EMPTY = '<mxfile host="app.diagrams.net"><diagram name="Page-1"><mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

function savedDiagram() {
  try { return localStorage.getItem(STORE) || EMPTY; } catch { return EMPTY; }
}
function downloadBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function downloadDataURI(uri, filename) {
  if (typeof uri !== 'string' || !/^data:image\/(png|svg\+xml|jpeg|webp)[;,]/i.test(uri)) {
    throw new Error('Định dạng ảnh xuất ra không hợp lệ.');
  }
  const a = document.createElement('a');
  a.href = uri; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}
export default function DiagramStudio({onClose,sourceHTML='',sourceTitle='',autoStart=false}) {
  const frame = useRef(null);
  const initialCandidates = useRef(findDiagramCandidates(sourceHTML));
  const lastXML = useRef(autoStart && initialCandidates.current.length ? makeDrawioXML(initialCandidates.current[0]) : savedDiagram());
  const pendingExport = useRef(null);
  const [ready, setReady] = useState(false);
  const [candidates, setCandidates] = useState(autoStart ? initialCandidates.current : []);
  const [name, setName] = useState(sourceTitle.slice(0,80) || 'blogger-workflow');
  const [message, setMessage] = useState('Đang mở draw.io…');
  const [dirty, setDirty] = useState(false);
  const send = useCallback(payload => {
    if (!frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage(JSON.stringify(payload), ORIGIN);
  }, []);
  const persist = useCallback(xml => {
    if (typeof xml !== 'string' || !xml.trim()) return;
    lastXML.current = xml;
    try { localStorage.setItem(STORE, xml); setMessage('Đã lưu bản sơ đồ trên trình duyệt.'); }
    catch { setMessage('Bộ nhớ trình duyệt đầy. Hãy xuất file .drawio.'); }
    setDirty(false);
  }, []);
  useEffect(() => {
    const handleMessage = event => {
      if (event.origin !== ORIGIN || event.source !== frame.current?.contentWindow) return;
      let data;
      try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
      catch { return; }
      if (!data || typeof data !== 'object') return;
      if (data.event === 'init') {
        setReady(true); send({action:'load',xml:lastXML.current,autosave:true,exportProtocol:true});
        setMessage(autoStart && initialCandidates.current.length ? 'Đã dựng sơ đồ từ bản nháp. Hãy duyệt nội dung và chỉnh sửa trước khi xuất ảnh.' : 'Sẵn sàng. Vẽ trực tiếp trên khung draw.io.');
      } else if (data.event === 'autosave' && typeof data.xml === 'string') {
        setDirty(true); persist(data.xml);
      } else if (data.event === 'save' && typeof data.xml === 'string') {
        persist(data.xml);
      } else if (data.event === 'export') {
        if (typeof data.xml === 'string') persist(data.xml);
        const format = pendingExport.current || data.format;
        pendingExport.current = null;
        try {
          if (typeof data.data === 'string' && ['svg','png'].includes(format)) {
            downloadDataURI(data.data, name.replace(/[^a-z0-9_-]/gi,'-') + '.' + format);
            setMessage('Đã xuất ' + format.toUpperCase() + '.');
          } else if (format === 'xml' && typeof data.xml === 'string') {
            downloadBlob(new Blob([data.xml],{type:'application/xml;charset=utf-8'}),name+'.drawio');
          }
        } catch (e) {setMessage(e.message);}
      } else if (data.event === 'exit') {
        setMessage('Bạn có thể đóng cửa sổ khi hoàn tất.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [send,persist,name]);
  const scanDraft = () => {
    const found = findDiagramCandidates(sourceHTML);
    setCandidates(found);
    setMessage(found.length ? 'Phát hiện ' + found.length + ' đoạn có thể minh họa. Chọn một đoạn để dựng sơ đồ.' : 'Không tìm thấy danh sách ít nhất 3 bước rõ ràng. Bạn vẫn có thể vẽ thủ công.');
  };
  const generateFrom = candidate => {
    if (!ready) return;
    if (!window.confirm('Thay bản sơ đồ hiện tại bằng sơ đồ tự tạo từ "' + candidate.heading + '"?')) return;
    const xml = makeDrawioXML(candidate);
    persist(xml);
    send({action:'load',xml,autosave:true,exportProtocol:true});
    setName(candidate.heading.slice(0,80));
    setMessage('Đã tạo sơ đồ theo nội dung bài nháp. Kiểm tra và chỉnh sửa trước khi dùng.');
  };
  const importFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {setMessage('File lớn hơn 5 MB.');return;}
    const xml = await file.text();
    if (!/<(mxfile|mxGraphModel)\b/.test(xml)) {setMessage('File không chứa sơ đồ draw.io XML hợp lệ.');return;}
    if (!window.confirm('Thay sơ đồ hiện tại bằng file vừa chọn?')) return;
    lastXML.current = xml;
    persist(xml);
    if (ready) send({action:'load',xml,autosave:true,exportProtocol:true});
    setName(file.name.replace(/\.(drawio|xml)$/i,'').slice(0,80) || 'diagram');
    setMessage('Đã nhập ' + file.name);
  };
  const exportFile = format => {
    if (!ready) return;
    if (format === 'drawio') {
      send({action:'export',format:'xml'});
      pendingExport.current = 'xml';
    } else {
      pendingExport.current = format; send({action:'export',format});
    }
  };
  const save = () => { if (ready) send({action:'save'}); };
  return <div className="diagram-overlay" role="dialog" aria-modal="true" aria-label="Diagram Studio">
    <div className="diagram-window">
      <div className="diagram-header">
        <div><strong>◇ Diagram Studio</strong><small>Draw.io · Editable diagrams</small></div>
        <input aria-label="Tên sơ đồ" value={name} onChange={e=>setName(e.target.value.slice(0,80))}/>
        <div className="diagram-actions">
          <label className="diagram-btn">↑ Nhập .drawio<input type="file" accept=".drawio,.xml,text/xml,application/xml" onChange={importFile} hidden/></label>
          <button className="diagram-btn" onClick={save} disabled={!ready}>Lưu</button>
          <button className="diagram-btn" onClick={()=>exportFile('drawio')} disabled={!ready}>↓ .drawio</button>
          <button className="diagram-btn" onClick={()=>exportFile('svg')} disabled={!ready}>↓ SVG</button>
          <button className="diagram-btn" onClick={()=>exportFile('png')} disabled={!ready}>↓ PNG</button>
          <button className="diagram-close" aria-label="Đóng Diagram Studio" onClick={onClose}>✕</button>
        </div>
      </div>
      {sourceHTML&&<div className="diagram-auto"><button className="diagram-btn" onClick={scanDraft}>✦ Phân tích bài nháp · Auto Visualize</button>{candidates.map(c=><button className="diagram-candidate" type="button" key={c.id} disabled={!ready} onClick={()=>generateFrom(c)} title={c.steps.join(" → ")}>{c.heading} <span>{c.steps.length} bước</span></button>)}</div>}
      <div className="diagram-notice" role="status">{message} {dirty?' · Đang ghi thay đổi…':''}</div>
      <iframe ref={frame} className="diagram-frame" title="Draw.io diagram editor" src={EMBED_URL} allow="clipboard-read; clipboard-write"/>
      <footer className="diagram-foot"><span>Sơ đồ tự lưu trong trình duyệt này; xuất .drawio để sao lưu và chỉnh sửa lại.</span><a href="https://www.drawio.com/docs/reference/embed-mode/" target="_blank" rel="noopener noreferrer">Hướng dẫn draw.io ↗</a></footer>
    </div>
  </div>;
}

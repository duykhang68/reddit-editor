import React, {useEffect, useRef, useState} from 'react';
import {googleDrive} from './services/googleDriveService.js';
import {serializeArticle, parseArticle} from './services/markdown.js';
import {seriesValidation} from './services/series.js';
import {discoverExpenseDriveClientId,validClientId,EDITOR_DRIVE_CLIENT_KEY} from './expenses/driveClientResolver.js';
const clientKey = EDITOR_DRIVE_CLIENT_KEY;
export default function DrivePanel({title, labels, html, series, schedule, dirty, onOpen, onBusy, externalBusy}) {
  const [manualClientId, setManualClientId] = useState(() => {try {return localStorage.getItem(clientKey) || '';} catch {return '';}});
  const [clientConfig, setClientConfig] = useState({clientId:'',source:'loading',loading:true,error:''});
  const [showClientInput, setShowClientInput] = useState(false);
  const clientId = showClientInput ? manualClientId : clientConfig.clientId;
  // Discover a valid public OAuth ID BEFORE the click that opens the GIS popup.
  // This also supports deployments that configure GOOGLE_CLIENT_ID only at runtime.
  useEffect(() => {
    let active = true;
    void discoverExpenseDriveClientId({
      environmentValue:import.meta.env.VITE_GOOGLE_CLIENT_ID,
      storedValue:manualClientId
    }).then(result => {
      if (!active) return;
      setClientConfig({...result,loading:false});
      setShowClientInput(!validClientId(result.clientId));
    });
    return () => {active = false;};
  }, []);
  const [connected, setConnected] = useState(googleDrive.connected());
  const [working, setWorking] = useState(false), [files, setFiles] = useState([]), [file, setFile] = useState(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [saved, setSaved] = useState('');
  const lock = useRef(false);
  const fingerprint = JSON.stringify({title, labels, html, series, schedule});
  useEffect(() => {const timer = setInterval(() => setConnected(googleDrive.connected()), 1000); return () => clearInterval(timer);}, []);
  async function run(action) {
    if (lock.current || externalBusy) return;
    lock.current = true; setWorking(true); onBusy(true); setError('');
    try {await action();} catch (e) {setError(e.message || String(e));}
    finally {setConnected(googleDrive.connected()); lock.current = false; setWorking(false); onBusy(false);}
  }
  const login = () => {
    if (clientConfig.loading) return;
    if (!validClientId(clientId)) {
      setError('OAuth Client ID chưa hợp lệ. Sử dụng Web Client ID có đuôi .apps.googleusercontent.com.');
      setShowClientInput(true);
      return;
    }
    // googleDrive.login is invoked directly during the user click (no async config fetch).
    run(async () => {
      try {
        await googleDrive.login(clientId.trim());
      } catch (cause) {
        // Allow correcting a configured ID when Google rejects it (origin/invalid_client).
        setManualClientId(clientId.trim());
        setShowClientInput(true);
        throw cause;
      }
      if (showClientInput) {
        try {localStorage.setItem(clientKey, clientId.trim());} catch {}
        setClientConfig({clientId:clientId.trim(),source:'manual',loading:false,error:''});
        setShowClientInput(false);
      }
      setFile(null); setSaved(''); setFiles([]); setMessage('Đã kết nối Drive.');
      setFiles(await googleDrive.listBlogPosts());
    });
  };
  const save = () => run(async () => {
    const issue=seriesValidation(series);
    if(issue) throw new Error('Series: '+issue);
    const result = await googleDrive.saveMarkdownToDrive(title, serializeArticle({title, labels, html, series, schedule}), file);
    setFile(result); setSaved(fingerprint); setMessage('Đã lưu ' + result.name + ' lúc ' + new Date().toLocaleTimeString('vi-VN'));
    setFiles(await googleDrive.listBlogPosts());
  });
  const open = item => {
    if ((dirty || saved) && saved !== fingerprint && !confirm('Nội dung hiện tại chưa lưu trên Drive. Vẫn mở bài khác?')) return;
    run(async () => {
      const loaded = await googleDrive.readMarkdown(item.id);
      const article = parseArticle(loaded.content, loaded.name);
      onOpen(article); setFile(loaded); setSaved(JSON.stringify(article)); setMessage('Đã mở ' + loaded.name);
    });
  };
  return <section className="kit-panel drive-panel" aria-label="Google Drive Markdown"><div className="kit-panel-body">
    <h2>Google Drive · Markdown</h2>
    <p>Lưu bài viết thành file .md trong Drive của bạn.</p>
    {clientConfig.loading ? <p role="status">Đang tìm cấu hình Google Drive…</p> :
      showClientInput ? <><label htmlFor="drive-client-id">OAuth Client ID</label>
        <input id="drive-client-id" type="password" value={manualClientId} disabled={externalBusy || working || connected}
          onChange={e => {setManualClientId(e.target.value); setError('');}} placeholder="…apps.googleusercontent.com" autoComplete="off" spellCheck="false" />
        {clientConfig.error && <small role="status">{clientConfig.error}</small>}
        {validClientId(clientConfig.clientId) && <button className="quiet" disabled={externalBusy || working}
          onClick={() => {setShowClientInput(false);setError('');}}>Dùng Client ID tự động</button>}
      </> : <p className="drive-client-ready">Đã nhận OAuth Client ID {clientConfig.source === 'build' ? 'từ cấu hình Cloudflare/Vite' : clientConfig.source === 'backend' ? 'từ cấu hình máy chủ' : clientConfig.source === 'editor' ? 'đã lưu trong Editor' : 'đã xác thực'}. Nhấn Kết nối Drive để đăng nhập Google.</p>}
    <div className="drive-actions"><button className="kit-button" disabled={externalBusy || working || clientConfig.loading || !validClientId(clientId)} onClick={login}>{connected ? 'Đổi tài khoản Drive' : 'Kết nối Drive'}</button>{connected && <button className="quiet" disabled={externalBusy || working} onClick={() => {googleDrive.disconnect(); setConnected(false); setFile(null); setFiles([]); setSaved(''); setMessage('Đã ngắt phiên Drive trên Editor.');}}>Ngắt Drive</button>}</div>
    <button className="save full" disabled={externalBusy || working || !connected || !title.trim()} onClick={save}>{working ? 'Đang xử lý…' : file ? 'Cập nhật file .md' : 'Lưu .md lên Drive'}</button>
    {file && <a href={'https://drive.google.com/file/d/' + encodeURIComponent(file.id) + '/view'} target="_blank" rel="noopener noreferrer">Xem file trên Drive ↗</a>}
    <div className="drive-message" role="status">{message}{saved && saved !== fingerprint && ' · Có thay đổi mới chưa lưu Drive.'}</div>
    {error && <div className="alert error" role="alert">{error}</div>}
    {connected && <><div className="drive-actions"><strong>Bài viết trên Drive</strong><button className="quiet" disabled={externalBusy || working} onClick={() => run(async () => setFiles(await googleDrive.listBlogPosts()))}>↻ Làm mới</button></div><div className="drive-files">{!files.length && <p>Chưa có file Markdown trong phạm vi ứng dụng.</p>}{files.map(item => <button className="postitem" key={item.id} disabled={externalBusy || working} onClick={() => open(item)}><span>{item.name}</span><small>{new Date(item.modifiedTime).toLocaleString('vi-VN')}</small></button>)}</div></>}
    <small>Chỉ truy cập file ứng dụng được cấp quyền. Kết nối lại khi phiên hết hạn.</small>
  </div></section>;
}

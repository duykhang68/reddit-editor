import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  STORAGE_KEY, PAYMENT_OPTIONS, POLICY_EFFECTIVE_DATE, analytics, money, monthlySeries,
  calculatePayable, normalizeTransaction, rewardsProgress, starNumber, starsFor, toCsv, todayVietnam, validDate
} from './model.js';
import { parseStarbucksReceipt } from './receiptOcr.js';
import { recognizeReceiptImage } from './receiptOcrBrowser.js';
import { useStarbucksDriveSync } from './useStarbucksDriveSync.js';

const initialForm = () => ({
  date: todayVietnam(), store: '', orderId: '', item: '', amount: '', baseAmount: '',
  extraAmount: '0', extraReason: '', discountAmount: '0', discountReason: '',
  fee: '0', cups: '1',
  payment: 'starbucks-card', eligible: true, identified: true, linked: false, excluded: false
});
const initialConfig = () => ({
  cycleStart: todayVietnam(), tier: 'green', membershipAdjustment: 0, rewardsAdjustment: 0, redeemed: 0
});
const formatMonth = key => key ? key.slice(5) + '/' + key.slice(0, 4) : '—';
const inputNumber = value => value === '' ? '' : Number(value);
const isThirdParty = payment => payment === 'third-party' || payment === 'third-party-cash';

function readSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const transactions = Array.isArray(parsed.transactions)
      ? parsed.transactions.slice(0, 20000).map(normalizeTransaction).filter(tx => tx.id) : [];
    const config = parsed.config && typeof parsed.config === 'object'
      ? { ...initialConfig(), ...parsed.config } : initialConfig();
    return { transactions, config };
  } catch {
    return { transactions: [], config: initialConfig() };
  }
}

function Icon({ name, size = 19 }) {
  const paths = {
    coffee: <><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" /><path d="M17 9h2a3 3 0 0 1 0 6h-2M8 3v2m4-2v2M3 22h17" /></>,
    wallet: <><rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 10h18M16 15h2M6 6V4h12"/></>,
    chart: <><path d="M3 3v18h18M7 15l4-4 3 2 5-7"/><path d="M17 6h2v2"/></>,
    star: <path d="m12 2 3.1 6.7 7.4.9-5.4 5.2 1.4 7.2L12 18.5 5.5 22l1.4-7.2L1.5 9.6l7.4-.9L12 2Z"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    pencil: <><path d="m4 20 5-.7L20 8.5 15.5 4 4.7 15 4 20Z"/><path d="m13 6 5 5"/></>,
    trash: <><path d="M4 7h16M10 3h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4"/></>,
    back: <path d="m15 18-6-6 6-6M9 12h12"/>,
    filter: <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/></>,
    spark: <><path d="m12 2 2 8 8 2-8 2-2 8-2-8-8-2 8-2 2-8Z"/></>,
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>;
}

function SpendingChart({ data, mode }) {
  const [active, setActive] = useState(-1);
  const width = Math.max(780, data.length * 56);
  const left = 75, right = 26, top = 25, bottom = 43, height = 300;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const peak = Math.max(1, ...data.map(item => item.amount));
  const ceiling = Math.max(50000, Math.ceil(peak / 50000) * 50000);
  const pointX = index => left + (index + .5) * plotWidth / data.length;
  const pointY = value => top + plotHeight * (1 - value / ceiling);
  const coordinates = data.map((entry, index) => [pointX(index), pointY(entry.amount)]);
  const line = coordinates.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ');
  const area = line + ' L' + pointX(data.length - 1) + ' ' + (height - bottom) +
    ' L' + pointX(0) + ' ' + (height - bottom) + ' Z';
  const selected = data[Math.min(Math.max(0, active), data.length - 1)];
  const reset = () => setActive(-1);
  return <div className="sb-chart-wrap">
    <div className="sb-chart-scroll" role="region" aria-label="Biểu đồ chi tiêu theo tháng" tabIndex={0}>
      <svg viewBox={'0 0 ' + width + ' ' + height} style={{ minWidth: width }} className="sb-chart" role="img" aria-label="Chi tiêu theo tháng tính bằng VNĐ">
        <defs>
          <linearGradient id="sb-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ff4500" stopOpacity=".18"/><stop offset="100%" stopColor="#ff4500" stopOpacity=".015"/></linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, index) => {
          const value = ceiling * (4 - index) / 4;
          const y = top + plotHeight * index / 4;
          return <g key={index}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e8edf1" strokeDasharray="4 6"/>
            <text x={left - 13} y={y + 4} textAnchor="end" className="sb-chart-axis">{new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value / 1000)}k</text>
          </g>;
        })}
        {mode === 'line' ? <>
          {data.length > 1 && <path d={area} fill="url(#sb-chart-fill)" />}
          <path d={line} stroke="#ff4500" strokeWidth="3.5" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
          {coordinates.map(([x, y], i) => <circle key={data[i].key} cx={x} cy={y} r={active === i ? 7 : 5} fill="#ff4500" stroke="#fff" strokeWidth="2.5" tabIndex={0} role="button" aria-label={formatMonth(data[i].key) + ': ' + money(data[i].amount)} onFocus={() => setActive(i)} onMouseEnter={() => setActive(i)} onMouseLeave={reset} onClick={() => setActive(i)} />)}
        </> : data.map((entry, index) => {
          const slot = plotWidth / data.length, barWidth = Math.min(54, slot * .62);
          const x = pointX(index) - barWidth / 2;
          const y = pointY(entry.amount);
          const barHeight = Math.max(0, height - bottom - y);
          return <rect key={entry.key} x={x} y={y} width={barWidth} height={barHeight} rx="7"
            fill={active === index || index === data.length - 1 ? '#ff4500' : '#ff9b78'}
            tabIndex={0} role="button" aria-label={formatMonth(entry.key) + ': ' + money(entry.amount)}
            onFocus={() => setActive(index)} onMouseEnter={() => setActive(index)} onMouseLeave={reset} onClick={() => setActive(index)} />;
        })}
        {data.map((entry, index) => <text key={entry.key} x={pointX(index)} y={height - 13} textAnchor="middle" className="sb-chart-axis">{entry.label}</text>)}
      </svg>
    </div>
    {selected && <div className="sb-chart-detail" aria-live="polite"><span><span className="sb-orange-dot"/> {active < 0 ? 'Tháng gần nhất' : 'Đang xem'}: <strong>{formatMonth(selected.key)}</strong></span><strong>{money(selected.amount)}</strong></div>}
  </div>;
}

function StatCard({ icon, label, value, hint, green = false }) {
  return <article className="sb-stat">
    <div className="sb-stat-top"><span>{label}</span><span className={'sb-stat-icon' + (green ? ' sb-green' : '')}><Icon name={icon}/></span></div>
    <strong className="sb-stat-value">{value}</strong><small>{hint}</small>
  </article>;
}

export default function StarbucksInsights() {
  const [{ transactions: initialTransactions, config: initialRewards }] = useState(readSaved);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [config, setConfig] = useState(initialRewards);
  const [form, setForm] = useState(initialForm);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState('bar');
  const [period, setPeriod] = useState('6');
  const [year, setYear] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const fileRef = useRef(null);
  const receiptFileRef = useRef(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptStatus, setReceiptStatus] = useState(null);
  const [receiptError, setReceiptError] = useState('');
  const [receiptResult, setReceiptResult] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  useEffect(() => () => { if (receiptPreview) URL.revokeObjectURL(receiptPreview); }, [receiptPreview]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ transactions, config }));
      setError('');
    } catch {
      setError('Không thể lưu vào trình duyệt. Hãy xuất JSON để tránh mất dữ liệu.');
    }
  }, [transactions, config]);

  const driveData = useMemo(() => ({ transactions, config }), [transactions, config]);
  const setRestoredData = useCallback(data => {
    setTransactions(data.transactions); setConfig(data.config);
    setEditing(null); setForm(initialForm()); setNotice('Đã tải dữ liệu Starbucks từ Google Drive.');
  }, []);
  const { sync, conflict, connected, connect, synchronize, resolveConflict,
    clientConfig, setManualClientId, toggleClientIdInput } = useStarbucksDriveSync(driveData, setRestoredData);
  const today = todayVietnam();

  const updateForm = (key, value) => setForm(current => {
    const next = { ...current, [key]: value };
    if (['baseAmount', 'extraAmount', 'discountAmount'].includes(key)) {
      const payable = calculatePayable(next.baseAmount, next.extraAmount, next.discountAmount);
      if (payable !== null && Number.isFinite(payable)) next.amount = String(payable);
    }
    return next;
  });
  const calculatedAmount = calculatePayable(form.baseAmount, form.extraAmount, form.discountAmount);
  const hasBaseAmount = form.baseAmount !== '';
  const beforeDiscount = hasBaseAmount ? Number(form.baseAmount) + Number(form.extraAmount || 0) : null;
  const updateConfig = (key, value) => setConfig(current => ({ ...current, [key]: value }));
  const availableYears = useMemo(() => [...new Set([today.slice(0, 4), ...transactions.map(tx => tx.date.slice(0, 4))])].sort().reverse(), [transactions, today]);
  const byPayment = useMemo(() => transactions.filter(tx => paymentFilter === 'all' || tx.payment === paymentFilter), [transactions, paymentFilter]);
  const series = useMemo(() => monthlySeries(transactions, { period, year, payment: paymentFilter, now: today }), [transactions, period, year, paymentFilter, today]);
  const stats = useMemo(() => analytics(byPayment, series), [byPayment, series]);
  const stars = useMemo(() => rewardsProgress(transactions, config, today), [transactions, config, today]);
  const allowedMonths = useMemo(() => new Set(series.map(row => row.key)), [series]);
  const history = useMemo(() => byPayment.filter(tx =>
    allowedMonths.has(tx.date.slice(0, 7)) &&
    (tx.item + ' ' + tx.store + ' ' + tx.orderId).toLocaleLowerCase('vi-VN').includes(query.toLocaleLowerCase('vi-VN'))
  ).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)), [byPayment, allowedMonths, query]);
  const pageCount = Math.max(1, Math.ceil(history.length / 8));
  const visibleHistory = history.slice((Math.min(page, pageCount) - 1) * 8, Math.min(page, pageCount) * 8);
  useEffect(() => { setPage(1); }, [period, year, paymentFilter, query]);

  const onSubmit = event => {
    event.preventDefault();
    setError('');
    try {
      const id = editing || (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + '-' + String(Math.random()).slice(2));
      if (form.orderId && transactions.some(tx => tx.id !== editing && tx.orderId === form.orderId) &&
        !window.confirm('Mã đơn hàng này đã có trong lịch sử. Bạn vẫn muốn lưu thêm?')) return;
      const next = normalizeTransaction({ ...form, amount: hasBaseAmount ? calculatedAmount : form.amount, id });
      setTransactions(current => editing ? current.map(tx => tx.id === editing ? next : tx) : [next, ...current]);
      setEditing(null); setForm(initialForm());
      setReceiptResult(null); setReceiptPreview(''); setReceiptStatus(null);
      setNotice(editing ? 'Đã cập nhật giao dịch.' : 'Đã thêm giao dịch và cập nhật thống kê.');
    } catch (cause) { setError(cause.message); }
  };
  const edit = tx => {
    setForm({
      ...tx, baseAmount: tx.baseAmount == null ? '' : String(tx.baseAmount),
      extraAmount: String(tx.extraAmount ?? 0), discountAmount: String(tx.discountAmount ?? 0),
      extraReason: tx.extraReason || '', discountReason: tx.discountReason || '',
      amount: String(tx.amount), fee: String(tx.fee), cups: String(tx.cups)
    });
    setEditing(tx.id);
    setReceiptResult(null); setReceiptPreview(''); setReceiptError('');
    document.querySelector('#sb-consumption')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const remove = tx => {
    if (!window.confirm('Xóa giao dịch ngày ' + tx.date + ' — ' + money(tx.amount) + '?')) return;
    setTransactions(current => current.filter(item => item.id !== tx.id));
    if (editing === tx.id) { setEditing(null); setForm(initialForm()); }
    setNotice('Đã xóa giao dịch. Các chỉ số đã được tính lại.');
  };
  const download = (content, filename, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click();
    anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportJson = () => download(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), transactions, config }, null, 2),
    'starbucks-insights-backup.json', 'application/json');
  const exportCsv = () => download(toCsv(history), 'starbucks-transactions.csv', 'text/csv;charset=utf-8');
  const importJson = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('File JSON tối đa 5 MB.');
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.transactions) || data.transactions.length > 20000) throw new Error('Backup JSON không đúng định dạng.');
      const valid = data.transactions.map(normalizeTransaction);
      if (valid.some(tx => !tx.id) || new Set(valid.map(tx => tx.id)).size !== valid.length) throw new Error('Backup có ID thiếu hoặc trùng.');
      if (!window.confirm('Nhập ' + valid.length + ' giao dịch? Dữ liệu hiện tại sẽ được thay thế.')) return;
      const nextConfig = data.config && typeof data.config === 'object' ? { ...initialConfig(), ...data.config } : initialConfig();
      setTransactions(valid); setConfig(nextConfig); setEditing(null); setForm(initialForm());
      setReceiptResult(null); setReceiptPreview('');
      setNotice('Đã khôi phục ' + valid.length + ' giao dịch.');
    } catch (cause) { setError('Không nhập được backup: ' + cause.message); }
    finally { event.target.value = ''; }
  };
  const importReceiptImage = async event => {
    const file = event.target.files?.[0];
    if (!file || receiptBusy) return;
    event.target.value = '';
    if ((editing || form.store || form.item || form.orderId || form.amount) &&
      !window.confirm('Dùng ảnh hóa đơn mới sẽ thay nội dung form đang nhập. Bạn muốn tiếp tục?')) return;
    setReceiptError(''); setReceiptStatus({ label: 'Đang chuẩn bị ảnh...', percent: 0 });
    setReceiptResult(null); setNotice(''); setReceiptBusy(true);
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024 || file.size === 0) {
        throw new Error('Chọn ảnh JPG/PNG/WebP hợp lệ, tối đa 10 MB.');
      }
      const preview = URL.createObjectURL(file);
      setReceiptPreview(preview);
      const recognized = await recognizeReceiptImage(file, setReceiptStatus);
      if (!recognized.text.trim()) throw new Error('Không đọc thấy chữ trên ảnh; thử chụp rõ nét, đủ sáng.');
      const result = parseStarbucksReceipt(recognized.text);
      if (!Object.keys(result.fields).length) throw new Error('Không tìm thấy dữ liệu hóa đơn Starbucks trong ảnh này.');
      const mapped = { ...result.fields };
      if (mapped.baseAmount && mapped.amount &&
        calculatePayable(mapped.baseAmount, mapped.extraAmount || 0, mapped.discountAmount || 0) !== Number(mapped.amount)) {
        // Giữ các khoản tiền đọc được; không xóa giá món gốc khi OCR thiếu phụ thu.
        // Validation khi lưu vẫn buộc người dùng đối soát tổng tiền.
        result.warnings.push('Giá món gốc + phụ thu − giảm giá chưa khớp thực trả. Đã giữ số OCR; hãy kiểm tra và sửa các khoản trước khi lưu.');
      }
      setForm({ ...initialForm(), ...mapped });
      setEditing(null);
      setReceiptResult({ ...result, confidence: recognized.confidence, mappedCount: Object.keys(mapped).length });
      setNotice('Đã điền thông tin từ ảnh. Hãy đối chiếu trước khi bấm Thêm giao dịch.');
    } catch (cause) {
      setReceiptError(cause?.message || 'Không đọc được ảnh hóa đơn.');
    } finally {
      setReceiptBusy(false); setReceiptStatus(null);
    }
  };
  const percent = Math.min(100, Math.max(0, stars.membershipPercent));
  const empty = transactions.length === 0;

  return <div className="sb-page">
    <div className="sb-shell">
      <header className="sb-header">
        <div className="sb-brand">
          <span className="sb-brand-icon"><Icon name="coffee" size={26}/></span>
          <div><div className="sb-eyebrow">DUY NGUYEN · PERSONAL INSIGHTS</div><h1>Starbucks Rewards <span>&amp; Insights.</span></h1>
            <p>Chi tiêu thông minh · Xu hướng theo tháng · Tích lũy Stars</p></div>
        </div>
        <div className="sb-header-actions">
          <span className="sb-member"><Icon name="star" size={15}/> {stars.tier === 'gold' ? 'Gold Level' : 'Green Level'}</span>
          <a href="/" className="sb-back"><Icon name="back" size={16}/> Về Editor</a>
        </div>
      </header>

      <section className={'sb-panel sb-drive sb-drive-' + sync.status} aria-label="Đồng bộ dữ liệu Starbucks với Google Drive">
        <div className="sb-drive-top">
          <div className="sb-drive-title">
            <span className="sb-drive-symbol"><Icon name="upload" size={20}/></span>
            <div><span className="sb-kicker">PRIVATE GOOGLE DRIVE BACKUP</span>
              <h2>Đồng bộ Google Drive <span className="sb-drive-dot" aria-hidden="true"/></h2>
              <p>Lưu giao dịch, giá món gốc, phụ thu, giảm giá, mã đơn và cấu hình Stars. Tách biệt dữ liệu với trang Expenses.</p>
            </div>
          </div>
          <div className="sb-drive-buttons">
            {!connected && <button className="sb-btn sb-btn-soft" type="button" disabled={clientConfig.loading || sync.status==='connecting'} onClick={()=>void connect()}>
              {clientConfig.loading ? 'Đang tìm OAuth…' : sync.status==='connecting' ? 'Đang kết nối…' : 'Kết nối Google Drive'}
            </button>}
            <button className="sb-btn sb-btn-primary" type="button" disabled={!connected || sync.status==='syncing' || sync.status==='connecting'} onClick={()=>void synchronize()}>
              <Icon name="upload" size={16}/>{sync.status==='syncing' ? 'Đang đồng bộ…' : 'Đồng bộ ngay'}
            </button>
          </div>
        </div>
        <div className="sb-drive-details" role="status" aria-live="polite">
          <strong>{sync.status==='synced' ? 'Đã sao lưu an toàn' : sync.status==='conflict' ? 'Cần xử lý xung đột' : sync.status==='pending' ? 'Chờ sao lưu' : connected ? 'Google Drive đã kết nối' : 'Chưa kết nối Drive'}</strong>
          <span>{sync.message}</span>
          <span>Tự đồng bộ mỗi 3 phút khi trang đang mở và phiên OAuth còn hiệu lực. {sync.lastSyncedAt ? 'Lần sao lưu: ' + new Date(sync.lastSyncedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}) : 'Chưa xác nhận bản sao trên Drive.'}</span>
          {sync.snapshotId && <a href={'https://drive.google.com/file/d/' + encodeURIComponent(sync.snapshotId) + '/view'} target="_blank" rel="noopener noreferrer">Mở bản sao Google Drive</a>}
          {!connected && !clientConfig.loading && clientConfig.clientId && !clientConfig.showInput &&
            <button className="sb-drive-text-btn" type="button" onClick={toggleClientIdInput}>Đổi OAuth Client ID</button>}
        </div>
        {!connected && clientConfig.showInput && <div className="sb-drive-config">
          <label htmlFor="sb-google-client">OAuth Web Client ID dùng chung Editor</label>
          <input id="sb-google-client" type="password" value={clientConfig.clientId} autoComplete="off" spellCheck="false"
            placeholder="123456789-example.apps.googleusercontent.com" onChange={e=>setManualClientId(e.target.value)}/>
          <small>Chỉ cần nhập nếu không tìm được cấu hình tự động. Client ID là công khai; không nhập Client Secret.</small>
        </div>}
        {conflict && <div className="sb-drive-conflict" role="alert">
          <strong>Có hai bản dữ liệu khác nhau — chưa ghi đè bản nào.</strong>
          <p>Trước khi chọn một bản, hệ thống sẽ tải JSON dự phòng của bản còn lại. Các snapshot cũ trên Drive vẫn được giữ.</p>
          <div className="sb-drive-buttons">
            <button className="sb-btn sb-btn-soft" type="button" onClick={()=>void resolveConflict('drive')}>Sao lưu local &amp; khôi phục Drive</button>
            <button className="sb-btn sb-btn-soft" type="button" onClick={()=>void resolveConflict('local')}>Sao lưu Drive &amp; dùng bản local</button>
          </div>
        </div>}
      </section>

      <section className="sb-panel sb-entry" id="sb-consumption" aria-labelledby="sb-entry-title">
        <div className="sb-section-heading"><div><span className="sb-kicker">01 / CONSUMPTION</span><h2 id="sb-entry-title">Ghi nhận giao dịch</h2><p>Thêm hóa đơn mới. Biểu đồ và sao sẽ tự cập nhật mà không phải tải lại trang.</p></div><span className="sb-section-icon"><Icon name="receipt"/></span></div>
        <form className="sb-form" onSubmit={onSubmit}>
          <div className="sb-receipt-import">
            <div className="sb-receipt-intro">
              <span className="sb-receipt-icon"><Icon name="upload" size={20}/></span>
              <div><strong>Import giao dịch từ ảnh hóa đơn</strong>
                <small>Tải ảnh Starbucks Rewards lên để tự điền form. Ảnh xử lý tại trình duyệt, không gửi lên máy chủ.</small></div>
              <button className="sb-btn sb-btn-soft" type="button" disabled={receiptBusy} onClick={() => receiptFileRef.current?.click()}>
                <Icon name="upload" size={16}/>{receiptBusy ? 'Đang đọc ảnh...' : 'Chọn ảnh hóa đơn'}
              </button>
              <input ref={receiptFileRef} className="sb-hidden" type="file" accept="image/png,image/jpeg,image/webp,.jpg,.jpeg,.png,.webp"
                onChange={importReceiptImage} aria-label="Tải ảnh hóa đơn Starbucks lên để tự điền giao dịch"/>
            </div>
            {receiptStatus && <div className="sb-ocr-loading" role="status" aria-live="polite">
              <span>{receiptStatus.label} {receiptStatus.percent > 0 ? receiptStatus.percent + '%' : ''}</span>
              <div role="progressbar" aria-label="Tiến độ OCR" aria-valuemin={0} aria-valuemax={100} aria-valuenow={receiptStatus.percent}>
                <span style={{ width: receiptStatus.percent + '%' }}/></div>
            </div>}
            {receiptError && <p className="sb-ocr-alert" role="alert">{receiptError} Bạn vẫn có thể nhập thủ công bên dưới.</p>}
            {receiptResult && <div className="sb-ocr-result">
              {receiptPreview && <img src={receiptPreview} alt="Ảnh hóa đơn vừa chọn để đối chiếu" className="sb-ocr-thumb"/>}
              <div className="sb-ocr-details">
                <strong>Đã tự điền {receiptResult.mappedCount} trường — vui lòng kiểm tra</strong>
                <p>{receiptResult.time && 'Giờ trên hóa đơn: ' + receiptResult.time + ' · '}
                  {receiptResult.confidence != null && 'Độ tin cậy OCR tham khảo: ' + Math.round(receiptResult.confidence) + '% · '}
                  Chỉ lưu khi bạn bấm Thêm giao dịch.</p>
                {receiptResult.warnings.length > 0 && <ul>{receiptResult.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
                <details><summary>Xem văn bản OCR để đối chiếu</summary><pre>{receiptResult.lines.join('\n')}</pre></details>
              </div>
            </div>}
            <small className="sb-ocr-hint">JPG, PNG, WebP · tối đa 10 MB. Lần đầu cần Internet để tải OCR tiếng Việt/Anh. Không tự tạo giao dịch và không lưu ảnh.</small>
          </div>
          <label>Ngày giao dịch<input required type="date" value={form.date} max={today} onChange={e => updateForm('date', e.target.value)}/></label>
          <label>Cửa hàng<input type="text" maxLength="120" placeholder="VD: Landmark 81" value={form.store} onChange={e => updateForm('store', e.target.value)}/></label>
          <label>Mã đơn hàng (không bắt buộc)<input type="text" maxLength={120} placeholder="VD: 123456 hoặc SBX-0987" autoComplete="off" value={form.orderId} onChange={e => updateForm('orderId', e.target.value)}/></label>
          <label>Tên món<input type="text" maxLength="120" placeholder="VD: Caffè Latte" value={form.item} onChange={e => updateForm('item', e.target.value)}/></label>
          <div className="sb-finance-heading"><strong>Chi tiết hóa đơn</strong><span>Tiền món gốc + phụ thu − giảm giá = thực trả</span></div>
          <label>Tiền món gốc (VNĐ)<input type="number" min="1" step="1" placeholder="VD: 80000" value={form.baseAmount} onChange={e => updateForm('baseAmount', e.target.value)}/></label>
          <label>Phụ thu / món thêm (VNĐ)<input type="number" min="0" step="1" value={form.extraAmount} onChange={e => updateForm('extraAmount', e.target.value)}/></label>
          <label>Giảm giá (VNĐ)<input type="number" min="0" step="1" value={form.discountAmount} onChange={e => updateForm('discountAmount', e.target.value)}/></label>
          <label>Thực trả (VNĐ)<input required type="number" min="1" step="1" placeholder={hasBaseAmount ? "Tự tính từ hóa đơn" : "VD: 75000"} readOnly={hasBaseAmount} value={hasBaseAmount ? (Number.isFinite(calculatedAmount) ? calculatedAmount : '') : form.amount} onChange={e => updateForm('amount', e.target.value)}/></label>
          <label className="sb-finance-reason">Chi tiết phụ thu / tùy chỉnh<input type="text" maxLength={200} placeholder="VD: Sữa Half & Half (+5.000đ)" value={form.extraReason} onChange={e => updateForm('extraReason', e.target.value)}/></label>
          <label className="sb-finance-reason">Lý do giảm giá<input type="text" maxLength={200} placeholder="VD: Ưu đãi ly cá nhân, voucher..." value={form.discountReason} onChange={e => updateForm('discountReason', e.target.value)}/></label>
          <div className="sb-finance-summary" aria-live="polite">
            <div className="sb-finance-summary-header">
              <strong>Đối soát hóa đơn</strong>
              <small>Cập nhật ngay theo các số tiền trong form · đơn vị VNĐ</small>
            </div>
            {hasBaseAmount ? <>
              <div className="sb-finance-equation">
                <div className="sb-finance-figure sb-finance-before">
                  <small>Tạm tính trước giảm</small>
                  <strong>{Number.isFinite(beforeDiscount) ? money(beforeDiscount) : '—'}</strong>
                  <span>Giá gốc {money(Number(form.baseAmount) || 0)} + phụ thu {money(Number(form.extraAmount) || 0)}</span>
                </div>
                <span className="sb-finance-operator" aria-hidden="true">−</span>
                <div className="sb-finance-figure sb-finance-discount">
                  <small>Giảm giá</small>
                  <strong>{money(Number(form.discountAmount) || 0)}</strong>
                  <span>{form.discountReason || 'Chưa có diễn giải giảm giá'}</span>
                </div>
                <span className="sb-finance-operator" aria-hidden="true">=</span>
                <div className="sb-finance-figure sb-finance-payable">
                  <small>Thực trả</small>
                  <strong>{Number.isFinite(calculatedAmount) ? money(calculatedAmount) : '—'}</strong>
                  <span>Số tiền sau các khoản điều chỉnh</span>
                </div>
              </div>
              {calculatedAmount <= 0 && <p className="sb-finance-warning">Tổng thực trả phải lớn hơn 0 ₫.</p>}
            </> : <p className="sb-finance-empty">Nhập tiền món gốc để xem đối soát tự động. Nếu chỉ biết số thực trả, bạn vẫn có thể nhập trực tiếp vào ô “Thực trả”.</p>}
            {receiptResult && Number(form.discountAmount) > 0 && !form.discountReason && <p className="sb-finance-ocr-note">OCR chưa tìm thấy diễn giải giảm giá rõ ràng trên hóa đơn; bạn có thể nhập bổ sung. Hệ thống không tự đoán lý do.</p>}
          </div>
          <label>Phương thức thanh toán<select value={form.payment} onChange={e => updateForm('payment', e.target.value)}>{PAYMENT_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
          <label>Số ly<input required type="number" min="0" max="1000" step="1" value={form.cups} onChange={e => updateForm('cups', e.target.value)}/></label>
          <label>Phí giao hàng / phí không tích sao (VNĐ)<input type="number" min="0" step="1" value={form.fee} onChange={e => updateForm('fee', e.target.value)}/></label>
          <div className="sb-checks">
            <label><input type="checkbox" checked={form.eligible} onChange={e => updateForm('eligible', e.target.checked)}/> Giao dịch đủ điều kiện tích sao</label>
            {isThirdParty(form.payment)
              ? <label><input type="checkbox" checked={form.linked} onChange={e => updateForm('linked', e.target.checked)}/> Đã liên kết tài khoản Starbucks với đối tác</label>
              : <label><input type="checkbox" checked={form.identified} onChange={e => updateForm('identified', e.target.checked)}/> Đã quét thẻ/QR Starbucks trước thanh toán</label>}
            <label><input type="checkbox" checked={form.excluded} onChange={e => updateForm('excluded', e.target.checked)}/> Không tính sao (sân bay quốc tế / hàng loại trừ)</label>
          </div>
          <div className="sb-form-actions">
            <button type="submit" className="sb-btn sb-btn-primary"><Icon name={editing ? 'pencil' : 'plus'} size={17}/>{editing ? 'Lưu thay đổi' : 'Thêm giao dịch'}</button>
            {editing && <button className="sb-btn sb-btn-soft" type="button" onClick={() => { setEditing(null); setForm(initialForm()); }}>Hủy chỉnh sửa</button>}
            <span className="sb-form-note">Ước tính: <strong>{(() => { try { return starNumber(starsFor(normalizeTransaction({ ...form, id: 'preview', amount: Number(form.amount) || 1, cups: Number(form.cups) || 0 }))); } catch { return '0'; } })()} ★</strong> mỗi loại</span>
          </div>
        </form>
        {(error || notice) && <p className={'sb-notice ' + (error ? 'sb-error' : 'sb-success')} role="status">{error || notice}</p>}
      </section>

      <section className="sb-analytics" aria-labelledby="sb-analytics-title">
        <div className="sb-heading"><div><span className="sb-kicker">02 / SPENDING ANALYTICS</span><h2 id="sb-analytics-title">Dòng tiền tiêu dùng</h2></div><span className="sb-subtle">Tính từ dữ liệu bạn đã nhập · {empty ? 'Chưa có giao dịch' : transactions.length + ' giao dịch đã lưu'}</span></div>
        <div className="sb-kpis">
          <StatCard icon="wallet" label="Tổng chi tiêu" value={money(stats.total)} hint="Trong khoảng thời gian đang chọn"/>
          <StatCard icon="coffee" label="Số ly đã uống" value={new Intl.NumberFormat('vi-VN').format(stats.cups)} hint={stats.visits + ' lần ghé / đặt hàng'}/>
          <StatCard icon="receipt" label="Trung bình / lần" value={money(stats.averageVisit)} hint="Tổng tiền chia số giao dịch"/>
          <StatCard icon="chart" label="Tháng cuối kỳ" value={money(stats.current)} hint={stats.change === null ? 'Chưa có kỳ so sánh' : (stats.change >= 0 ? '+' : '') + stats.change.toFixed(1) + '% so với tháng trước'}/>
        </div>
        <div className="sb-panel sb-chart-panel">
          <div className="sb-chart-heading"><div><h3>Monthly Spending Trends</h3><p>Xu hướng chi tiêu theo tháng · VNĐ</p></div><div className="sb-controls">
            <label className="sb-select-label"><span>Khoảng thời gian</span><select aria-label="Khoảng thời gian biểu đồ" value={period} onChange={e => { setPeriod(e.target.value); setYear(''); }} disabled={!!year}><option value="6">6 tháng</option><option value="12">12 tháng</option><option value="24">24 tháng</option><option value="all">Toàn bộ</option></select></label>
            <label className="sb-select-label"><span>Năm</span><select aria-label="Lọc năm" value={year} onChange={e => setYear(e.target.value)}><option value="">Mọi năm</option>{availableYears.map(y => <option value={y} key={y}>{y}</option>)}</select></label>
            <label className="sb-select-label"><span>Thanh toán</span><select aria-label="Lọc phương thức thanh toán" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}><option value="all">Tất cả</option>{PAYMENT_OPTIONS.map(p => <option value={p.value} key={p.value}>{p.label}</option>)}</select></label>
            <div className="sb-segment" role="group" aria-label="Loại biểu đồ"><button type="button" aria-pressed={mode === 'bar'} className={mode === 'bar' ? 'active' : ''} onClick={() => setMode('bar')}>Bar</button><button type="button" aria-pressed={mode === 'line'} className={mode === 'line' ? 'active' : ''} onClick={() => setMode('line')}>Line</button></div>
          </div></div>
          {stats.visits === 0 ? <div className="sb-empty-chart"><Icon name="chart" size={38}/><strong>Chưa có chi tiêu trong khoảng chọn</strong><span>Thêm giao dịch phía trên hoặc đổi bộ lọc để xem biểu đồ.</span></div> : <SpendingChart data={series} mode={mode}/>}
          <div className="sb-insights">
            <div><span>Cao nhất</span><strong>{money(stats.peak?.amount)}</strong><small>{stats.peak ? formatMonth(stats.peak.key) : 'Chưa có'}</small></div>
            <div><span>Thấp nhất có phát sinh</span><strong>{money(stats.low?.amount)}</strong><small>{stats.low ? formatMonth(stats.low.key) : 'Chưa có'}</small></div>
            <div><span>Bình quân / tháng</span><strong>{money(stats.averageMonth)}</strong><small>Tính cả tháng chi tiêu bằng 0</small></div>
            <div><span>MoM</span><strong className={stats.change != null && stats.change >= 0 ? 'sb-positive' : ''}>{stats.change == null ? '—' : (stats.change >= 0 ? '+' : '') + stats.change.toFixed(1) + '%'}</strong><small>{stats.change == null ? 'Không đủ kỳ so sánh' : 'Tháng cuối kỳ / tháng liền trước'}</small></div>
          </div>
        </div>
      </section>

      <section className="sb-rewards" aria-labelledby="sb-rewards-title">
        <div className="sb-heading"><div><span className="sb-kicker">03 / STARS &amp; REWARDS</span><h2 id="sb-rewards-title">Tiến độ hội viên</h2></div><span className="sb-subtle">Ước tính · Không kết nối trực tiếp với tài khoản Starbucks</span></div>
        <div className="sb-reward-grid">
          <article className="sb-panel sb-progress-panel">
            <div className="sb-card-heading"><div><h3><Icon name="star" size={19}/> Stars xét hạng</h3><p>{stars.tier === 'gold' ? 'Duy trì Gold' : 'Green → Gold'} · Chu kỳ 12 tháng</p></div><span className="sb-member">{stars.tier === 'gold' ? 'Gold' : 'Green'}</span></div>
            <div className="sb-stars-big"><strong>{starNumber(stars.membership)}</strong><span>/ 100 Stars</span></div>
            <div className="sb-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(percent)} aria-label="Tiến độ sao xét hạng"><span style={{ width: percent + '%' }}/></div>
            <p className="sb-progress-copy">{stars.remaining ? 'Còn ' + starNumber(stars.remaining) + ' sao để ' + (stars.tier === 'gold' ? 'duy trì Gold.' : 'đủ điều kiện lên Gold.') : 'Đã đạt ngưỡng 100 sao trong chu kỳ đang theo dõi.'}</p>
            <small className="sb-subtle">Chu kỳ: {stars.period ? stars.period.start + ' → ' + stars.period.end + ' (không bao gồm ngày kết thúc)' : 'Cần ngày bắt đầu hợp lệ'}</small>
            <div className="sb-divider"/>
            <div className="sb-card-heading"><div><h3><Icon name="spark" size={18}/> Stars đổi thưởng</h3><p>Số dư ước tính, không phải số dư chính thức</p></div><strong className="sb-reward-count">{starNumber(stars.rewards)} ★</strong></div>
            <div className="sb-reward-foot">Mốc đổi thưởng gần nhất: {stars.redemptionGoal} ★ · Còn {starNumber(stars.redemptionRemaining)} ★</div>
          </article>
          <article className="sb-panel sb-settings-panel">
            <div className="sb-card-heading"><div><h3>Đối soát tài khoản</h3><p>Điều chỉnh dựa trên ứng dụng Starbucks thực tế.</p></div><Icon name="calendar" size={20}/></div>
            <div className="sb-settings-fields">
              <label>Ngày bắt đầu chu kỳ<input type="date" value={config.cycleStart} max={today} onChange={e => updateConfig('cycleStart', e.target.value)} /></label>
              <label>Hạng thành viên hiện tại<select value={config.tier} onChange={e => updateConfig('tier', e.target.value)}><option value="green">Green Level</option><option value="gold">Gold Level</option></select></label>
              <label>Điều chỉnh sao xét hạng<input type="number" step=".001" value={config.membershipAdjustment} onChange={e => updateConfig('membershipAdjustment', inputNumber(e.target.value))}/></label>
              <label>Điều chỉnh sao đổi thưởng<input type="number" step=".001" value={config.rewardsAdjustment} onChange={e => updateConfig('rewardsAdjustment', inputNumber(e.target.value))}/></label>
              <label>Sao đổi thưởng đã dùng<input type="number" min="0" step=".001" value={config.redeemed} onChange={e => updateConfig('redeemed', inputNumber(e.target.value))}/></label>
            </div>
            <p className="sb-rules-note">Theo chính sách Việt Nam từ 18/08/2026: 40.000đ/★ (Starbucks Card), 60.000đ/★ (thanh toán khác tại quán), 80.000đ/★ (đối tác đủ điều kiện). Giao dịch trước ngày này không tự tính theo quy định mới. Sao có thể là số thập phân. <a href="https://starbucks.vn/ve-chung-toi/cong-ty/chinh-sach-truc-tuyen/starbucks-rewards-terms-and-conditions/" target="_blank" rel="noreferrer">Xem điều khoản ↗</a></p>
          </article>
        </div>
      </section>

      <section className="sb-panel sb-history" aria-labelledby="sb-history-title">
        <div className="sb-history-heading"><div><span className="sb-kicker">TRANSACTION HISTORY</span><h2 id="sb-history-title">Lịch sử giao dịch</h2><p>{history.length} giao dịch khớp bộ lọc</p></div>
          <div className="sb-export">
            <button className="sb-btn sb-btn-soft" type="button" onClick={exportJson}><Icon name="download" size={16}/> Backup JSON</button>
            <button className="sb-btn sb-btn-soft" type="button" onClick={exportCsv}><Icon name="download" size={16}/> CSV</button>
            <button className="sb-btn sb-btn-soft" type="button" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16}/> Nhập JSON</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="sb-hidden" onChange={importJson} aria-label="Nhập backup JSON"/>
          </div></div>
        <input type="search" className="sb-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm món, cửa hàng hoặc mã đơn hàng..." aria-label="Tìm trong lịch sử giao dịch" autoComplete="off"/>
        <div className="sb-table-scroll"><table><thead><tr><th>Ngày</th><th>Món / Cửa hàng</th><th>Mã đơn hàng</th><th>Thanh toán</th><th className="sb-num">Tiền món gốc</th><th className="sb-num">Phụ thu</th><th className="sb-num">Giảm giá</th><th className="sb-num">Thực trả</th><th className="sb-num">Sao xét hạng</th><th className="sb-num">Sao đổi thưởng</th><th>Thao tác</th></tr></thead>
          <tbody>{visibleHistory.map(tx => <tr key={tx.id}>
            <td>{tx.date.split('-').reverse().join('/')}</td><td><strong>{tx.item || '—'}</strong><small>{tx.store || '—'} · {tx.cups} ly</small></td><td className="sb-order-id">{tx.orderId || '—'}</td><td>{PAYMENT_OPTIONS.find(p => p.value === tx.payment)?.label}</td>
            <td className="sb-num">{tx.baseAmount == null ? '—' : money(tx.baseAmount)}</td>
            <td className="sb-num sb-extra">{tx.extraAmount ? '+' + money(tx.extraAmount) : '—'}{tx.extraReason && <small className="sb-finance-detail" title={tx.extraReason}>{tx.extraReason}</small>}</td>
            <td className="sb-num sb-discount">{tx.discountAmount ? '−' + money(tx.discountAmount) : '—'}{tx.discountReason && <small className="sb-finance-detail" title={tx.discountReason}>{tx.discountReason}</small>}</td>
            <td className="sb-num sb-money">{money(tx.amount)}</td><td className="sb-num sb-green-text">{starNumber(starsFor(tx))} ★</td><td className="sb-num sb-green-text">{starNumber(starsFor(tx))} ★</td>
            <td className="sb-actions"><button type="button" onClick={() => edit(tx)} title="Sửa giao dịch" aria-label={'Sửa giao dịch ' + tx.date}><Icon name="pencil" size={16}/></button><button type="button" onClick={() => remove(tx)} title="Xóa giao dịch" aria-label={'Xóa giao dịch ' + tx.date}><Icon name="trash" size={16}/></button></td>
          </tr>)}</tbody>
        </table>{history.length === 0 && <div className="sb-empty-history">Chưa có giao dịch phù hợp. Thêm một hóa đơn để bắt đầu thống kê.</div>}</div>
        {pageCount > 1 && <div className="sb-pagination"><span>Trang {Math.min(page, pageCount)} / {pageCount}</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><button disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Sau</button></div></div>}
      </section>
      <footer className="sb-footer"><span>© Duy Nguyen · Reddit-inspired Light Analytics</span><span>Dữ liệu lưu tại trình duyệt; có thể sao lưu Google Drive sau khi kết nối và cấp quyền.</span></footer>
    </div>
  </div>;
}

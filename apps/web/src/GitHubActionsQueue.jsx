import React, {useEffect, useState} from 'react';
import {
  ACTIONS_REFRESH_MS,
  ACTIONS_WEB_URL,
  isWaitingRun,
  loadActionsQueue
} from './services/actionsQueue.mjs';
import './GitHubActionsQueue.css';

const formatTime = value => {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  return new Date(value).toLocaleTimeString('vi-VN', {hour: '2-digit', minute: '2-digit'});
};

const RESULT_LABELS = {
  success: 'Thành công',
  failure: 'Thất bại',
  cancelled: 'Đã hủy',
  skipped: 'Bỏ qua',
  timed_out: 'Hết giờ',
  neutral: 'Trung lập',
  action_required: 'Cần xử lý'
};

function ClockIcon() {
  return <svg className="gaq-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
}

function RunRow({run}) {
  const running = run.status === 'in_progress';
  const waiting = isWaitingRun(run.status);
  const label = running ? 'Đang chạy' : waiting ? (run.status === 'queued' ? 'Xếp hàng' : 'Chờ xử lý') : (RESULT_LABELS[run.conclusion] || 'Hoàn tất');
  const result = !running && !waiting ? ' is-' + (run.conclusion || 'unknown') : '';
  return <a className="gaq-item" href={run.url} target="_blank" rel="noopener noreferrer" title={'Xem workflow run #' + run.id + ' trên GitHub'}>
    <span className={'gaq-status ' + (running ? 'is-running' : waiting ? 'is-waiting' : 'is-finished') + result}>
      {waiting ? <ClockIcon/> : <span className="gaq-status-dot" aria-hidden="true"/>}
    </span>
    <span className="gaq-item-content">
      <span className="gaq-item-title">{run.name}</span>
      <span className="gaq-item-message">{run.message}</span>
      <span className="gaq-item-meta">
        <span className={'gaq-state' + (running ? ' is-running' : '')}>{label}</span>
        <span aria-hidden="true">·</span>
        <span>{run.sha || 'No SHA'}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={run.createdAt}>{formatTime(run.createdAt)}</time>
      </span>
      {run.branch && <span className="gaq-branch" title={run.branch}>{run.branch}</span>}
    </span>
    <span className="gaq-item-arrow" aria-hidden="true">↗</span>
  </a>;
}

export default function GitHubActionsQueue() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let fetching = false;
    let lastRequest = 0;
    const controller = new AbortController();
    const load = async (force = false) => {
      if ((!force && document.hidden) || fetching || (!force && Date.now() - lastRequest < ACTIONS_REFRESH_MS)) return;
      fetching = true;
      lastRequest = Date.now();
      setLoading(true);
      try {
        const result = await loadActionsQueue({signal: controller.signal});
        if (active) {
          setSnapshot({...result, refreshedAt: Date.now()});
          setError('');
        }
      } catch (err) {
        if (active && err.name !== 'AbortError') setError(err.message || 'Không thể kết nối GitHub.');
      } finally {
        fetching = false;
        if (active) setLoading(false);
      }
    };
    load(true);
    const timer = window.setInterval(() => load(), ACTIONS_REFRESH_MS);
    const onVisible = () => {if (!document.hidden) load();};
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshKey]);

  const activeCount = (snapshot?.runningCount || 0) + (snapshot?.queuedCount || 0);
  return <section className="kit-panel gaq" aria-labelledby="gaq-heading">
    <div className="gaq-head">
      <div>
        <span className="gaq-eyebrow">GITHUB · ALL WORKFLOWS</span>
        <h2 id="gaq-heading">Queue <span className={'gaq-led' + (snapshot?.runningCount ? ' is-live' : '')} aria-hidden="true"/></h2>
        <p>Giám sát CI/CD ngay khi viết bài.</p>
      </div>
      <button type="button" className="gaq-refresh" onClick={() => setRefreshKey(key => key + 1)} disabled={loading} aria-label="Làm mới Queue từ GitHub" title="Làm mới ngay">↻</button>
    </div>
    <div className="gaq-stats" aria-label="Số liệu GitHub Actions từ các run mới nhất">
      <div><strong className="gaq-number-waiting">{snapshot ? snapshot.queuedCount : '—'}</strong><span>◷ Đang chờ</span></div>
      <div><strong className="gaq-number-running">{snapshot ? snapshot.runningCount : '—'}</strong><span>● Đang chạy</span></div>
      <div><strong>{snapshot ? snapshot.sampleCount : '—'}</strong><span>Runs đã quét</span></div>
    </div>
    <div className="gaq-content">
      <div className="gaq-section-heading"><strong>Đang xử lý</strong><span>{snapshot ? activeCount + ' runs' : (loading ? 'Đang tải…' : '—')}</span></div>
      {snapshot?.active.length ? <div className="gaq-list">{snapshot.active.map(run => <RunRow key={run.id} run={run}/>)}</div>
        : <div className="gaq-empty" role="status">{loading && !snapshot ? 'Đang lấy trạng thái workflow…' : snapshot ? 'Chưa thấy run nào đang chạy hoặc chờ trong dữ liệu đã quét.' : 'Chưa có dữ liệu workflow.'}</div>}
      {snapshot?.hiddenActiveCount > 0 && <a className="gaq-more" href={ACTIONS_WEB_URL} target="_blank" rel="noopener noreferrer">+{snapshot.hiddenActiveCount} runs khác · Xem trên GitHub ↗</a>}
      {snapshot?.recent.length > 0 && <div className="gaq-recent">
        <div className="gaq-section-heading"><strong>Hoàn tất gần đây</strong><span>Lịch sử</span></div>
        <div className="gaq-list">{snapshot.recent.map(run => <RunRow key={run.id} run={run}/>)}</div>
      </div>}
    </div>
    <div className="gaq-foot">
      <span>{snapshot ? 'Cập nhật ' + formatTime(new Date(snapshot.refreshedAt).toISOString()) + ' · ~90 giây/lần' : 'Nguồn: GitHub Actions API'}</span>
      <a href={ACTIONS_WEB_URL} target="_blank" rel="noopener noreferrer">All workflows ↗</a>
    </div>
    {snapshot?.hasMoreHistory && <p className="gaq-disclaimer">Số đếm chỉ tính {snapshot.sampleCount} runs gần nhất, không phải toàn bộ lịch sử. Workflow không đồng nghĩa với deploy.</p>}
    {error && <p className="gaq-error" role="alert">{error}{snapshot ? ' Đang giữ dữ liệu đồng bộ gần nhất.' : ''}</p>}
  </section>;
}

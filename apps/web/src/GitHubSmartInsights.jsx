import React, {useCallback, useEffect, useMemo, useState} from 'react';
import './GitHubSmartInsights.css';

const REPO = 'duykhang68/tetdinhmuiblog';
const VERSION = 'fix-version:v1.1.0';
const REFRESH_MS = 5 * 60 * 1000;
const MAX_PAGES = 10;
const issueSearch = (extra = '') => 'https://github.com/' + REPO + '/pulls?q=' + encodeURIComponent('is:pr state:closed' + (extra ? ' ' + extra : ''));

async function loadClosedPRs(signal) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch('https://api.github.com/repos/' + REPO + '/pulls?state=closed&per_page=100&page=' + page, {
      signal,
      headers: {'Accept': 'application/vnd.github+json'}
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) throw new Error('GitHub API đang giới hạn truy cập. Vui lòng thử lại sau.');
      throw new Error('Không lấy được dữ liệu GitHub (HTTP ' + response.status + ').');
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Dữ liệu GitHub không hợp lệ.');
    all.push(...batch);
    if (batch.length < 100) return {pulls: all, truncated: false};
  }
  return {pulls: all, truncated: true};
}

export default function GitHubSmartInsights() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refetch, setRefetch] = useState(0);

  const refresh = useCallback(() => setRefetch(x => x + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      if (document.hidden) return;
      setLoading(true);
      try {
        const data = await loadClosedPRs(controller.signal);
        if (active) {setSnapshot({...data, updatedAt: Date.now()});setError('');}
      } catch (e) {
        if (active && e.name !== 'AbortError') setError(e.message || 'Không thể kết nối GitHub.');
      } finally {if (active) setLoading(false);}
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    const onVisible = () => {if (!document.hidden) load();};
    document.addEventListener('visibilitychange', onVisible);
    return () => {active = false;controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange', onVisible);};
  }, [refetch]);

  const metrics = useMemo(() => {
    if (!snapshot) return null;
    const counts = new Map();
    const pulls = snapshot.pulls;
    pulls.forEach(pr => {
      const uniqueNames = new Set((pr.labels || []).map(label => label.name).filter(Boolean));
      uniqueNames.forEach(name => counts.set(name, (counts.get(name) || 0) + 1));
    });
    const labels = [...counts].map(([name, count]) => ({name, count})).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
    return {total: pulls.length, merged: pulls.filter(pr => Boolean(pr.merged_at)).length, version: counts.get(VERSION) || 0, labels};
  }, [snapshot]);

  const max = metrics?.labels[0]?.count || 1;
  return <section className="ghsi" aria-label="GitHub Smart Insights: thống kê PR đã đóng">
    <div className="ghsi-head"><div><div className="ghsi-kicker"><span className="ghsi-dot" /> GITHUB · SMART INSIGHTS</div><h2>Nhìn lại những thay đổi<span>.</span></h2><p>Pull requests đã đóng, phân tích theo nhãn GitHub.</p></div><button type="button" className="ghsi-refresh" onClick={refresh} disabled={loading} aria-label="Cập nhật thống kê GitHub">{loading ? 'Đang tải…' : '↻ Làm mới'}</button></div>
    <div className="ghsi-metrics">
      <a href={issueSearch()} target="_blank" rel="noopener noreferrer"><strong>{metrics ? metrics.total.toLocaleString('vi-VN') : '—'}</strong><span>Closed PRs ↗</span></a>
      <a href={issueSearch('is:merged')} target="_blank" rel="noopener noreferrer"><strong>{metrics ? metrics.merged.toLocaleString('vi-VN') : '—'}</strong><span>Merged PRs ↗</span></a>
      <a href={issueSearch('label:' + VERSION)} target="_blank" rel="noopener noreferrer"><strong>{metrics ? metrics.version.toLocaleString('vi-VN') : '—'}</strong><span>fix-version:v1.1.0 ↗</span></a>
    </div>
    <div className="ghsi-charts"><div className="ghsi-chart-head"><strong>Top labels</strong><small>Đếm số PR mang từng nhãn · một PR có thể có nhiều nhãn</small></div>
      {metrics?.labels.length ? <div className="ghsi-bars">{metrics.labels.slice(0, 6).map(({name,count}) => <a key={name} className="ghsi-bar" href={issueSearch('label:"' + name + '"')} target="_blank" rel="noopener noreferrer" title={'Mở PR có label ' + name}><div className="ghsi-bar-meta"><span>{name}</span><b>{count}</b></div><div className="ghsi-track"><div style={{width: (count / max * 100) + '%'}} /></div></a>)}</div> : <p className="ghsi-empty">{loading ? 'Đang đồng bộ dữ liệu GitHub…' : metrics ? 'Chưa có PR mang label.' : 'Chưa có dữ liệu.'}</p>}
    </div>
    <div className="ghsi-foot"><span>{snapshot ? 'Cập nhật ' + new Date(snapshot.updatedAt).toLocaleTimeString('vi-VN') + ' · Tự làm mới mỗi 5 phút' : 'Nguồn: GitHub REST API'}</span><a href={issueSearch()} target="_blank" rel="noopener noreferrer">Xem tất cả PR ↗</a></div>
    {snapshot?.truncated && <p className="ghsi-alert">Chỉ hiển thị 1.000 PR mới nhất. Tổng số liệu có thể chưa đầy đủ.</p>}
    {error && <p className="ghsi-alert" role="status">{error}{snapshot ? ' · Đang giữ số liệu lần đồng bộ gần nhất.' : ''}</p>}
  </section>;
}

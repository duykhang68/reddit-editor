// Browser-only fallback for the PUBLIC GitHub Actions repository.
// Must be called only after the existing Google OAuth /api/status gate succeeds.
// No token is stored or forwarded to the browser. Keep calls bounded for 60/hour API limit.
const REPO = 'duykhang68/tetdinhmuiblog';
const API = 'https://api.github.com/repos/' + REPO;
const CACHE_MS = 5 * 60_000;
let last = null;
let until = 0;
let pending = null;
function status(item) {
  if (item.status !== 'completed') return 'running';
  if (item.conclusion === 'success') return 'passed';
  if (['failure','timed_out','startup_failure','action_required'].includes(item.conclusion)) return 'failed';
  return 'other';
}
export function summarizePublicRuns(runs, clock = new Date()) {
  const all = Array.isArray(runs) ? runs : [];
  const ciRuns = all.filter(r => r.path === '.github/workflows/ci.yml' || r.name === 'CI · Quality Gate');
  const finished = ciRuns.filter(r => status(r)==='passed'||status(r)==='failed');
  const passed = finished.filter(r => status(r)==='passed').length;
  const failed = finished.length - passed;
  const running = ciRuns.filter(r => status(r)==='running').length;
  const history = Array.from({length: 14}, (_, index) => {
    const day = new Date(Date.UTC(clock.getUTCFullYear(),clock.getUTCMonth(),clock.getUTCDate()-13+index)).toISOString().slice(0,10);
    const slice = ciRuns.filter(r => String(r.created_at||'').slice(0,10)===day);
    return {day, passed: slice.filter(r=>status(r)==='passed').length, failed: slice.filter(r=>status(r)==='failed').length, running: slice.filter(r=>status(r)==='running').length};
  });
  return {ci: {total:ciRuns.length,passed,failed,running,excluded:ciRuns.length - passed - failed - running,successRate:finished.length ? Math.round(passed / finished.length * 1000)/10 : null}, history};
}
async function github(fetcher, path) {
  const res=await fetcher(API+path,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(12000)});
  if(!res.ok) {
    const err = new Error(res.status===403||res.status===429
      ? 'GitHub API đang giới hạn truy cập từ mạng của thiết bị. Cần cấu hình GITHUB_TOKEN trên Cloudflare Pages.'
      : 'GitHub public API HTTP '+res.status);
    err.status=res.status;
    throw err;
  }
  return res.json();
}
function runRow(run) {
  return {id:run.id,runId:run.id,name:'Xem jobs trong workflow',workflow:run.name||'Workflow',branch:run.head_branch||'',sha:String(run.head_sha||'').slice(0,8),event:run.event||'',status:status(run),conclusion:run.conclusion||null,startedAt:run.run_started_at||run.created_at,completedAt:run.updated_at||null,url:run.html_url,runUrl:run.html_url,kind:'workflow'};
}
async function readPublicSnapshot(fetcher, now) {
  // A single mandatory request (more robust than the server's 8+ GH subrequests).
  const data=await github(fetcher,'/actions/runs?per_page=60');
  if(!Array.isArray(data.workflow_runs)) throw new Error('GitHub trả về định dạng dữ liệu không hợp lệ.');
  const all=data.workflow_runs;
  const stats=summarizePublicRuns(all, new Date(now()));
  const recent=all.slice(0,12);
  const details=await Promise.all(recent.slice(0,2).map(async r=>{
    try {
      const result=await github(fetcher,'/actions/runs/'+r.id+'/jobs?per_page=100');
      if(!Array.isArray(result.jobs)||!result.jobs.length) return [runRow(r)];
      return result.jobs.map(j=>({id:j.id,runId:r.id,name:j.name||'Unnamed job',workflow:r.name||'Workflow',branch:r.head_branch||'',sha:String(r.head_sha||'').slice(0,8),event:r.event||'',status:status(j),conclusion:j.conclusion||null,startedAt:j.started_at||r.run_started_at||r.created_at,completedAt:j.completed_at||null,url:j.html_url||r.html_url,runUrl:r.html_url,kind:'job'}));
    } catch { return [runRow(r)]; }
  }));
  const jobs=[...details.flat(),...recent.slice(2).map(runRow)].sort((a,b)=>Date.parse(b.startedAt||0)-Date.parse(a.startedAt||0));
  return {
    repository:REPO,fetchedAt:new Date(now()).toISOString(),source:'github-browser',
    sourceLabel:'GitHub public API · browser fallback',
    sample:{ciRuns:stats.ci.total,recentWorkflowRuns:all.length,displayedJobs:jobs.length},
    ci:stats.ci,history:stats.history,
    latest:all.slice(0,10).map(r=>({id:r.id,name:r.name||'Workflow',status:status(r),createdAt:r.created_at,url:r.html_url})),
    jobs,coverage:{linePercent:null,measuredAt:null},
    security:{critical:null,major:null,minor:null,codeSmells:null},
    deployment:{averageMinutes:null,sampleSize:0,source:'Cloudflare latency unavailable in browser fallback'}
  };
}
export function loadPublicQualityGate({fetcher=fetch,now=Date.now,force=false}={}) {
  if(!force && last && now()<until) return Promise.resolve(last);
  if(pending) return pending;
  pending=readPublicSnapshot(fetcher,now)
    .then(data=>{last=data;until=now()+CACHE_MS;return data;})
    .catch(error=>{if(last)return {...last,stale:true};throw error;})
    .finally(()=>{pending=null;});
  return pending;
}

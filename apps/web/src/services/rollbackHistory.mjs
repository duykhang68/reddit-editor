// Public, read-only GitHub history for the Rollback ID Dashboard.
// NEVER exposes or accepts the Cloudflare GITHUB_TOKEN from the browser.
export const ROLLBACK_REPOSITORY = 'duykhang68/tetdinhmuiblog';
const API = 'https://api.github.com/repos/' + ROLLBACK_REPOSITORY;
const BRANCHES = new Set(['main', 'deploy', 'gh-pages']);
const lower = x => String(x || '').toLowerCase();

export function validatedBranch(branch) {
  const value = String(branch || 'main');
  if (!BRANCHES.has(value)) throw Object.assign(new Error('Branch không được hỗ trợ.'), { status: 400 });
  return value;
}
async function githubJson(fetcher, path, token) {
  const res = await fetcher(API + path, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    signal: AbortSignal.timeout(15000)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const code = res.status === 403 || res.status === 429 ? 'GITHUB_RATE_OR_ACCESS' : 'GITHUB_HTTP_' + res.status;
    const err = new Error('GitHub API ' + res.status + ' (' + path.split('?')[0] + '). Kiểm tra rate limit hoặc quyền đọc.');
    err.status = res.status;
    err.code = code;
    throw err;
  }
  if (json == null) throw Object.assign(new Error('GitHub trả về dữ liệu rỗng.'), {status: 502});
  return json;
}
function runPriority(run) {
  const name = lower(run.name), event = lower(run.event);
  return (/deploy|release|ci|quality|build|rollback/.test(name) ? 10 : 0)
    - (/taxonomy|research|collector|auditor|schedule/.test(name) ? 8 : 0)
    + (event === 'push' ? 4 : event === 'workflow_dispatch' ? 3 : 0);
}
export function actionStatus(run) {
  if (!run) return 'neutral';
  if (['queued','pending','in_progress','waiting','requested'].includes(run.status)) return 'running';
  if (run.conclusion === 'success') return 'success';
  if (['failure','cancelled','timed_out','action_required'].includes(run.conclusion)) return 'failed';
  return 'neutral';
}
export function mergeRollbackHistory(commits, pulls, runs, branch='main') {
  if (!Array.isArray(commits) || !Array.isArray(pulls) || !Array.isArray(runs)) throw new Error('Unexpected GitHub API payload.');
  const prBySha = new Map();
  const mergedPulls = pulls.filter(p => p.merged_at);
  for (const p of mergedPulls) if (p.merge_commit_sha) prBySha.set(lower(p.merge_commit_sha), p);
  const runsBySha = new Map();
  for (const run of runs) {
    const sha = lower(run.head_sha);
    if (!sha) continue;
    const arr = runsBySha.get(sha) || [];
    arr.push(run);
    runsBySha.set(sha, arr);
  }
  for (const arr of runsBySha.values()) arr.sort((a,b) => runPriority(b)-runPriority(a) || Date.parse(b.created_at)-Date.parse(a.created_at));
  const rows = commits.map(commit => {
    const sha = String(commit.sha || '');
    const message = String(commit.commit?.message || 'No commit message');
    const pr = prBySha.get(lower(sha)) || mergedPulls.find(p => message.includes('(#' + p.number + ')')) || null;
    const run = (runsBySha.get(lower(sha)) || [])[0] || null;
    return {
      sha,
      message: message.slice(0,10000),
      author: commit.author?.login || commit.commit?.author?.name || 'Unknown',
      avatar: commit.author?.avatar_url || '',
      pr: pr?.number || null,
      prTitle: pr?.title || null,
      prBody: String(pr?.body || '').slice(0,10000),
      time: commit.commit?.committer?.date || commit.commit?.author?.date || null,
      status: actionStatus(run),
      runUrl: run?.html_url || null,
      runId: run?.id || null,
      env: run?.head_branch || branch,
      files: null,
      isDemo: false
    };
  });
  return rows.sort((a,b)=>Date.parse(b.time || 0) - Date.parse(a.time || 0));
}
export async function loadRollbackHistory({fetcher=fetch, token='', branch='main'}={}) {
  branch = validatedBranch(branch);
  const params = 'per_page=100';
  const paths = [
    '/commits?sha=' + encodeURIComponent(branch) + '&' + params,
    '/pulls?state=closed&sort=updated&direction=desc&' + params,
    '/actions/runs?' + params,
    '/actions/workflows/ci.yml/runs?' + params
  ];
  const [commits, pulls, actions, ci] = await Promise.all(paths.map(p => githubJson(fetcher,p,token)));
  if (!Array.isArray(commits) || !Array.isArray(pulls) || !Array.isArray(actions.workflow_runs) || !Array.isArray(ci.workflow_runs)) {
    throw Object.assign(new Error('GitHub trả về cấu trúc dữ liệu không hợp lệ.'), {status:502});
  }
  const runs = [...new Map([...actions.workflow_runs,...ci.workflow_runs].map(r => [r.id,r])).values()];
  return {
    source:'github', repo:ROLLBACK_REPOSITORY, branch, fetchedAt:new Date().toISOString(),
    sampleSize:commits.length, historyLimit:100, mergedPRs:pulls.filter(p=>p.merged_at).length,
    actionsSample:runs.length, rows:mergeRollbackHistory(commits,pulls,runs,branch)
  };
}
export async function loadRollbackDetail({fetcher=fetch,token='',sha,pr=null}={}) {
  if (!/^[a-f0-9]{40}$/i.test(String(sha||''))) throw Object.assign(new Error('SHA phải có 40 ký tự hex.'), {status:400});
  if (pr !== null && (!Number.isInteger(Number(pr)) || Number(pr) < 1 || Number(pr) > 100000000)) {
    throw Object.assign(new Error('PR number không hợp lệ.'), {status:400});
  }
  const paths = ['/commits/' + sha];
  if (pr !== null) paths.push('/pulls/' + Number(pr) + '/files?per_page=100');
  const [commit,files] = await Promise.all(paths.map(p=>githubJson(fetcher,p,token)));
  return {source:'github',sha:commit.sha,message:commit.commit?.message || '',files:Array.isArray(files)?files.map(f=>f.filename):[],filesTruncated:Array.isArray(files)&&files.length===100};
}

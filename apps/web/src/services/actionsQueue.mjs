// A repository-wide, read-only snapshot of GitHub Actions workflow runs.
// GitHub's /actions/runs endpoint is not a deployment API: a completed run
// is never presented as a confirmed production deployment.
export const ACTIONS_REPO = 'duykhang68/tetdinhmuiblog';
export const ACTIONS_WEB_URL = 'https://github.com/' + ACTIONS_REPO + '/actions';
export const ACTIONS_REFRESH_MS = 90_000;
export const ACTIONS_RUN_LIMIT = 100;
const API_URL = 'https://api.github.com/repos/' + ACTIONS_REPO + '/actions/runs?per_page=' + ACTIONS_RUN_LIMIT;
const WAITING = new Set(['queued', 'pending', 'waiting', 'requested']);

export const isWaitingRun = status => WAITING.has(status);

const timestamp = value => {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
};

function normalizeRun(run) {
  const id = Number(run?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return {
    id,
    name: String(run.name || 'Workflow không tên'),
    status: String(run.status || ''),
    conclusion: run.conclusion ? String(run.conclusion) : null,
    message: String(run.head_commit?.message || run.display_title || run.head_sha?.slice(0, 7) || 'Không có thông tin commit').split('\n')[0],
    sha: String(run.head_sha || '').slice(0, 7),
    branch: String(run.head_branch || ''),
    event: String(run.event || ''),
    runNumber: Number(run.run_number) || 0,
    createdAt: run.created_at || '',
    updatedAt: run.updated_at || '',
    url: ACTIONS_WEB_URL + '/runs/' + id
  };
}

export function summarizeActionsQueue(payload) {
  if (!payload || !Array.isArray(payload.workflow_runs)) {
    throw new Error('Dữ liệu GitHub Actions không hợp lệ.');
  }
  const runs = payload.workflow_runs.map(normalizeRun).filter(Boolean);
  const running = runs.filter(run => run.status === 'in_progress').sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
  const queued = runs.filter(run => isWaitingRun(run.status)).sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt));
  const completed = runs.filter(run => run.status === 'completed').sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
  const active = [...running, ...queued];
  const totalCount = Number.isFinite(Number(payload.total_count)) ? Number(payload.total_count) : runs.length;

  return {
    runningCount: running.length,
    queuedCount: queued.length,
    active: active.slice(0, 5),
    hiddenActiveCount: Math.max(0, active.length - 5),
    recent: completed.slice(0, 2),
    sampleCount: payload.workflow_runs.length,
    hasMoreHistory: totalCount > payload.workflow_runs.length
  };
}

export async function loadActionsQueue({fetcher = fetch, signal} = {}) {
  const response = await fetcher(API_URL, {
    signal,
    cache: 'no-store',
    headers: {Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error('GitHub API đang giới hạn truy cập. Hãy thử lại sau.');
    }
    throw new Error('Không thể đọc GitHub Actions (HTTP ' + response.status + ').');
  }
  return summarizeActionsQueue(await response.json());
}

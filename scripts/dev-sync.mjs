import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INTERVAL_MS = 20_000;

export function updatePlan(paths) {
  const install = paths.some(path => /^(?:package(?:-lock)?\.json|apps\/(?:web|server)\/package\.json)$/.test(path));
  const restart = install || paths.some(path => /^(?:scripts\/dev\.mjs|apps\/web\/vite\.config\.[^/]+|apps\/server\/\.env\.example)$/.test(path));
  return { install, restart };
}

export function pollInterval(value) {
  const interval = Number(value);
  return Number.isInteger(interval) && interval >= 5_000 && interval <= 300_000
    ? interval : DEFAULT_INTERVAL_MS;
}

function run(command, args, { quiet = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT, encoding: 'utf8', stdio: quiet ? 'inherit' : 'pipe', windowsHide: true,
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')
  });
  if (result.error || result.status !== 0) {
    const message = result.stderr?.trim() || result.error?.message || `exit ${result.status}`;
    throw new Error(`${command} ${args.join(' ')}: ${message}`);
  }
  return result.stdout?.trim() ?? '';
}

function git(...args) { return run('git', args); }
function head() { return git('rev-parse', 'HEAD'); }
function changedFiles(before, after) {
  return git('diff', '--name-only', before, after).split(/\r?\n/).filter(Boolean);
}

async function main() {
  let dev = null;
  let stopping = false;
  let pendingInstall = !existsSync(resolve(ROOT, 'node_modules'));
  let lastHead;
  let initialBranch;
  let notice = '';
  let hadServerEnv = existsSync(resolve(ROOT, 'apps/server/.env'));
  const interval = pollInterval(process.env.LOCAL_SYNC_INTERVAL_MS);

  function status(message) {
    if (message !== notice) console.log(`[local-sync] ${message}`);
    notice = message;
  }

  async function stopDev() {
    if (!dev) return;
    const child = dev;
    dev = null;
    const exited = new Promise(resolveExit => {
      if (child.exitCode !== null || child.signalCode !== null) return resolveExit();
      child.once('exit', resolveExit);
      setTimeout(resolveExit, 5_000).unref();
    });
    if (process.platform === 'win32') {
      try { run('taskkill', ['/PID', String(child.pid), '/T', '/F']); }
      catch { child.kill(); }
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); }
      catch { child.kill('SIGTERM'); }
    }
    await exited;
  }

  function startDev() {
    if (stopping || dev) return;
    console.log('[local-sync] Khởi chạy Editor: npm run dev:local');
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev:local'], {
      cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
      detached: process.platform !== 'win32'
    });
    dev = child;
    child.on('error', error => console.error('[local-sync] Không chạy được npm:', error.message));
    child.on('exit', (code, signal) => {
      if (dev === child) {
        dev = null;
        if (!stopping) console.warn(`[local-sync] Dev server đã dừng (${signal || code}); sẽ thử mở lại.`);
      }
    });
  }

  async function prepareDev() {
    if (stopping) return;
    if (pendingInstall) {
      if (dev) await stopDev();
      console.log('[local-sync] Cập nhật dependencies bằng npm ci...');
      run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], { quiet: true });
      pendingInstall = false;
    }
    startDev();
  }

  async function reflect(before, after) {
    const files = changedFiles(before, after);
    const plan = updatePlan(files);
    if (plan.install) pendingInstall = true;
    if (plan.restart && dev) await stopDev();
    console.log(`[local-sync] Đã nhận commit ${after.slice(0, 8)} (${files.length} file).`);
    if (!plan.restart) console.log('[local-sync] Vite HMR / Node watch tự cập nhật, không restart.');
    else console.log('[local-sync] Thay đổi cấu hình/dependencies: khởi động lại sau khi chuẩn bị.');
  }

  try {
    initialBranch = git('symbolic-ref', '--quiet', '--short', 'HEAD');
    lastHead = head();
    console.log(`[local-sync] Theo dõi nhánh ${initialBranch}, kiểm tra mỗi ${interval / 1_000}s.`);
  } catch (error) {
    console.warn(`[local-sync] Không nhận diện được Git branch: ${error.message}. Chỉ chạy dev local.`);
  }

  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    void stopDev().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  async function tick() {
    if (stopping) return;
    try {
      if (initialBranch) {
        const branch = git('symbolic-ref', '--quiet', '--short', 'HEAD');
        if (branch !== initialBranch) {
          status(`Đã chuyển sang ${branch}; đồng bộ tạm dừng. Hãy restart npm run dev trên nhánh mới.`);
        } else {
          let current = head();
          if (current !== lastHead) {
            await reflect(lastHead, current); // git pull / merge từ terminal khác
            lastHead = current;
          }
          const remote = git('config', '--get', `branch.${branch}.remote`);
          const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
          if (remote === '.') throw new Error('Upstream là nhánh local; hãy thiết lập tracking remote.');
          git('fetch', '--quiet', '--prune', remote);
          const incoming = git('rev-parse', '@{upstream}');
          if (incoming !== current) {
            const ff = spawnSync('git', ['merge-base', '--is-ancestor', current, incoming], { cwd: ROOT });
            if (ff.status !== 0) {
              status(`Local và ${upstream} đã diverge hoặc local đi trước. Không tự reset/rebase.`);
            } else if (git('status', '--porcelain', '--untracked-files=normal')) {
              status('Có thay đổi local chưa commit. Tạm hoãn pull để không ghi đè dữ liệu.');
            } else {
              git('merge', '--ff-only', upstream);
              const updated = head();
              if (updated !== current) {
                await reflect(current, updated);
                lastHead = updated;
              }
              status(`Đã đồng bộ ${upstream} tại ${updated.slice(0, 8)}.`);
            }
          } else {
            status(`Đã đồng bộ ${upstream} tại ${current.slice(0, 8)}.`);
          }
        }
      }
      const hasServerEnv = existsSync(resolve(ROOT, 'apps/server/.env'));
      if (hasServerEnv !== hadServerEnv) {
        hadServerEnv = hasServerEnv;
        console.log('[local-sync] Cấu hình Blogger backend thay đổi; khởi động lại Editor.');
        await stopDev();
      }
      await prepareDev();
    } catch (error) {
      status(`${error.message}. Sẽ thử lại sau ${interval / 1_000}s; không reset dữ liệu local.`);
      try { await prepareDev(); } catch (prepareError) {
        console.error('[local-sync] Chưa thể khởi chạy Editor:', prepareError.message);
      }
    } finally {
      if (!stopping) setTimeout(tick, interval);
    }
  }

  await tick();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('[local-sync]', error); process.exitCode = 1; });
}

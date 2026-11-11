import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const hasBackend = existsSync(new URL('../apps/server/.env', import.meta.url));
if (!hasBackend) console.log('\nDrive/local mode: mở http://localhost:5173. Blogger cần apps/server/.env.\n');
const children = [];
const workspaces = hasBackend ? [['API','@duynguyen/editor-server'],['WEB','@duynguyen/editor-web']] : [['WEB','@duynguyen/editor-web']];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exitCode = code;
}
for (const [name, workspace] of workspaces) {
  const args = ['run', 'dev', '--workspace', workspace];
  if (name === 'WEB' && process.argv.includes('--open')) args.push('--', '--open');
  const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {stdio:'inherit', env:process.env, shell:process.platform === 'win32'});
  children.push(child);
  child.on('error', error => {console.error(name, error.message); stop(1);});
  child.on('exit', (code, signal) => {if (!stopping) {console.error(`${name} stopped (${signal || code}).`); stop(code || 0);}});
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());

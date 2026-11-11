// Reproducible, fail-closed staging Worker build. Never mutate production source.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MODULES = Object.freeze([
  'apps/web/src/cashflow-intelligence/ledger.mjs',
  'apps/web/src/cashflow-intelligence/duplicates.mjs',
  'apps/web/src/cashflow-intelligence/receipt.mjs',
  'apps/web/src/starbucks-insights/receiptOcr.js',
  'apps/web/src/starbucks-insights/model.js'
]);

const ORIGINAL_ENTRY = [
  'fetch(request){return workerHandlers.fetch(request,this.env,this.ctx)}',
  ' scheduled(controller){return workerHandlers.scheduled(controller,this.env,this.ctx)}'
].join('\n');
const STAGING_ENTRY = [
  "fetch(request){const u=new URL(request.url);if(request.method==='GET'&&u.pathname==='/health'){return new Response(JSON.stringify({ok:true,service:'reddit-editor-cashflow-staging',staging:true,ledgerConfigured:!!this.env.DB,evidenceConfigured:!!this.env.EVIDENCE,telegramConfigured:false}),{headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}})}return new Response(JSON.stringify({error:'staging_http_disabled'}),{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}})}",
  ' scheduled(){return undefined}'
].join('\n');

export function makeStagingWorkerSource(original) {
  if (original.split(ORIGINAL_ENTRY).length !== 2) {
    throw Error('Staging Worker: exact production entrypoint no longer matches; stop deployment.');
  }
  const source = original.replace(ORIGINAL_ENTRY, STAGING_ENTRY);
  if (!source.includes("error:'staging_http_disabled'") || !source.includes('scheduled(){return undefined}')) {
    throw Error('Staging Worker must disable HTTP mutations and scheduled processing.');
  }
  return source;
}

export async function buildStagingWorker(base = ROOT) {
  const out = resolve(base, 'cashflow-backend/.staging-dist');
  const original = await readFile(resolve(base, 'cashflow-backend/worker.mjs'), 'utf8');
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'worker.mjs'), makeStagingWorkerSource(original));
  for (const file of MODULES) {
    const target = resolve(out, 'source', file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(resolve(base, file)));
  }
  return { path: out, copiedModules: MODULES.length, scheduledDisabled: true, httpPolicy: 'health-only' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildStagingWorker().then(out => {
    console.log('STAGING_WORKER_BUILD_OK', JSON.stringify(out));
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

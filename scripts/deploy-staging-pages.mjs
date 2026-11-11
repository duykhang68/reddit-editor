// Deploy ONLY the fail-closed readiness worker to a dedicated Cloudflare Pages project.
// Requires a scoped token in the environment. Never accept a project name from CLI.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const STAGING_PROJECT = 'reddit-editor-integration-staging';
export const STAGING_DB = '5dab001b-e703-49bf-974a-35251d630328';
export const STAGING_WORKER = 'reddit-editor-cashflow-staging';

export function assertIsolatedConfig(project) {
  if (project?.name !== STAGING_PROJECT) throw Error('Not the isolated staging Pages project');
  const configs = project?.deployment_configs || {};
  for (const name of ['production', 'preview']) {
    const binding = configs[name];
    if (binding?.d1_databases?.CASHFLOW_DB?.id !== STAGING_DB) {
      throw Error('Staging ' + name + ' D1 binding does not match');
    }
    if (binding?.services?.CASHFLOW_BACKEND?.service !== STAGING_WORKER) {
      throw Error('Staging ' + name + ' Cashflow Worker binding does not match');
    }
  }
  return true;
}

export async function deploy({ accountId, token, fetcher = fetch } = {}) {
  if (!/^[0-9a-f]{32}$/.test(accountId || '') || !token) {
    throw Error('Set CLOUDFLARE_ACCOUNT_ID and scoped CLOUDFLARE_STAGING_API_TOKEN');
  }
  const api = 'https://api.cloudflare.com/client/v4/accounts/' + accountId
    + '/pages/projects/' + STAGING_PROJECT;
  const headers = { Authorization: 'Bearer ' + token };
  const check = await fetcher(api, { headers });
  if (!check.ok) throw Error('Unable to inspect staging project before deployment (HTTP ' + check.status + ')');
  const info = await check.json();
  if (!info.success) throw Error('Staging project metadata was not verified');
  assertIsolatedConfig(info.result);

  const source = await readFile(new URL('../infra/cloudflare/staging-pages-worker.mjs', import.meta.url));
  const form = new FormData();
  form.append('branch', 'main');
  form.append('manifest', '{}');
  form.append('_worker.js', new Blob([source], { type: 'application/javascript' }), '_worker.js');
  const result = await fetcher(api + '/deployments', { method: 'POST', headers, body: form });
  if (!result.ok) throw Error('Staging deployment failed (HTTP ' + result.status + ')');
  const deployment = await result.json();
  if (!deployment.success || !deployment.result?.id) throw Error('Staging deployment returned no success evidence');
  return { project: STAGING_PROJECT, deploymentId: deployment.result.id, deploymentUrl: deployment.result.url };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!process.argv.includes('--deploy-staging')) {
    console.error('Explicit --deploy-staging flag is required; no changes made.');
    process.exitCode = 2;
  } else {
    deploy({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      token: process.env.CLOUDFLARE_STAGING_API_TOKEN
    }).then(data => console.log('STAGING_ONLY_DEPLOYMENT_CREATED', JSON.stringify(data)))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

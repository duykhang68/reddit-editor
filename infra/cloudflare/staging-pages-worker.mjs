// Isolated Cloudflare Pages staging readiness gateway.
// No production OAuth callbacks, CORS relaxations, financial read APIs or writes.
const HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex,nofollow',
  'referrer-policy': 'no-referrer'
});
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return respond({ error: 'staging_readonly' }, 405);
    if (url.pathname === '/health' || url.pathname === '/api/staging/health') {
      if (!env.CASHFLOW_DB || !env.CASHFLOW_BACKEND) {
        return respond({ error: 'staging_binding_missing' }, 503);
      }
      try {
        const revision = await env.CASHFLOW_DB.prepare(
          'SELECT revision FROM cashflow_revision WHERE id=1'
        ).first();
        const rows = await env.CASHFLOW_DB.prepare(
          'SELECT COUNT(*) count FROM transactions'
        ).first();
        const rpc = await env.CASHFLOW_BACKEND.fetch('https://staging-worker.internal/health');
        const service = rpc.ok ? await rpc.json() : null;
        const isolated = Boolean(
          revision && rows?.count === 0 && service?.staging === true
          && service?.ledgerConfigured === true && service?.evidenceConfigured === true
        );
        return respond({
          ok: isolated,
          stage: 'isolated',
          source: 'cloudflare-pages-staging',
          d1Connected: Boolean(revision),
          transactionsEmpty: rows?.count === 0,
          workerConnected: rpc.ok && service?.staging === true,
          workerHasR2: Boolean(service?.evidenceConfigured),
          authEnabled: false
        }, isolated ? 200 : 503);
      } catch {
        return respond({ error: 'staging_readiness_unavailable' }, 503);
      }
    }
    if (url.pathname === '/') {
      const html = [
        '<!doctype html><html lang="vi"><meta charset="utf-8">',
        '<meta name="robots" content="noindex"><title>Reddit Editor · Backend Staging</title>',
        '<body style="font:16px system-ui;background:#f6f7f8;color:#253344;padding:36px;max-width:760px;margin:auto">',
        '<h1>Reddit Editor · Backend Staging</h1>',
        '<p>Đây là môi trường kỹ thuật tách biệt, không phải production.',
        'Không nhập dữ liệu cá nhân hoặc thử giao dịch thật.</p>',
        '<p>Endpoint kiểm chứng: <a href="/health">/health</a></p>',
        '<p>OAuth và các API có quyền ghi đang bị khóa cho đến khi kiểm thử hoàn chỉnh.</p>',
        '</body></html>'
      ].join('');
      return new Response(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-robots-tag': 'noindex,nofollow',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
        }
      });
    }
    return respond({ error: 'staging_auth_not_configured' }, 503);
  }
};

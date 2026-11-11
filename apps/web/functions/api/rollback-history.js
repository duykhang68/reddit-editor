import { loadRollbackHistory, loadRollbackDetail } from '../../src/services/rollbackHistory.mjs';

// A public, read-only, same-origin Cloudflare Pages Function.
// The server token never reaches the client. The upstream repository is fixed.
export async function onRequestGet({request,env}) {
  const url = new URL(request.url);
  const token = String(env.GITHUB_TOKEN || env.RESEARCH_GITHUB_TOKEN || '').trim();
  const headers = {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'X-Frame-Options':'DENY'
  };
  try {
    const data = url.searchParams.has('sha')
      ? await loadRollbackDetail({token,sha:url.searchParams.get('sha'),pr:url.searchParams.get('pr')})
      : await loadRollbackHistory({token,branch:url.searchParams.get('branch') || 'main'});
    return new Response(JSON.stringify(data),{status:200,headers});
  } catch (err) {
    console.error('[rollback-history]',err.code||err.name,err.message);
    const status = err.status === 400 ? 400 : err.status === 404 ? 404 : err.status === 403 || err.status === 429 ? 503 : 502;
    return new Response(JSON.stringify({source:'error',code:err.code||'GITHUB_FETCH_FAILED',error:err.message||'GitHub temporarily unavailable'}),{status,headers});
  }
}

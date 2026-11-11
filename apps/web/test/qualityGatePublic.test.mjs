import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePublicRuns, loadPublicQualityGate} from '../src/services/qualityGatePublic.mjs';
const now = new Date('2026-11-07T08:00:00.000Z');
const mk = (id,name,conclusion,status='completed')=>({
  id,name,path:name==='CI · Quality Gate'?'.github/workflows/ci.yml':'.github/workflows/other.yml',
  conclusion,status,created_at:'2026-11-07T07:00:00Z',head_branch:'main',head_sha:'a'.repeat(40),
  html_url:'https://github.com/duykhang68/tetdinhmuiblog/actions/runs/'+id,event:'push'
});
test('public fallback samples only CI for success rate',()=>{
  const stats=summarizePublicRuns([
    mk(1,'CI · Quality Gate','success'),mk(2,'CI · Quality Gate','failure'),
    mk(3,'CI · Quality Gate',null,'queued'),mk(4,'CI · Quality Gate','cancelled'),
    mk(5,'Other workflow','success')
  ],now);
  assert.deepEqual(stats.ci,{total:4,passed:1,failed:1,running:1,excluded:1,successRate:50});
  assert.equal(stats.history.length,14);
});
test('public API fallback uses one mandatory endpoint, tolerates job details failures and caches response',async()=>{
  let calls=[];
  const fetcher=async url=>{
    calls.push(String(url));
    if(String(url).includes('/actions/runs?per_page=60'))return new Response(JSON.stringify({
      workflow_runs:[mk(101,'CI · Quality Gate','success'),mk(102,'Other workflow',null,'in_progress'),mk(103,'CI · Quality Gate','failure')]
    }),{status:200});
    return new Response('',{status:503});
  };
  const a=await loadPublicQualityGate({fetcher,now:()=>now.getTime()});
  assert.equal(a.source,'github-browser');
  assert.equal(a.jobs.length,3);
  assert.equal(a.ci.successRate,50);
  assert.equal(a.jobs[0].kind,'workflow');
  assert.ok(a.jobs.every(j=>/^https:\/\/github\.com\//.test(j.url)));
  assert.deepEqual([a.coverage.linePercent,a.security.critical,a.deployment.averageMinutes],[null,null,null]);
  const count=calls.length;
  const b=await loadPublicQualityGate({fetcher,now:()=>now.getTime()+10000});
  assert.equal(b,a);
  assert.equal(calls.length,count,'cached fallback must not hammer 60/hour unauthenticated GitHub API limit');
});

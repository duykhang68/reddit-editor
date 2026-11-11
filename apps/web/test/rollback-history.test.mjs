import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {validatedBranch,actionStatus,mergeRollbackHistory,loadRollbackHistory,loadRollbackDetail} from '../src/services/rollbackHistory.mjs';

test('branch allowlist excludes unsupported refs',()=> {
  assert.equal(validatedBranch('main'),'main');
  assert.throws(()=>validatedBranch('master'),/không được hỗ trợ/);
});
test('merge selects real commits and matches a merged PR and CI run',()=>{
  const sha='a'.repeat(40);
  const rows=mergeRollbackHistory([
    {sha,commit:{message:'feat: working (#5)',committer:{date:'2026-11-07T02:00:00Z'}},author:{login:'duykhang68'}}
  ],[{number:5,merged_at:'2026-11-07T03:00:00Z',merge_commit_sha:sha,title:'A feature'}],
  [{id:100,head_sha:sha,event:'push',name:'CI · Quality Gate',status:'completed',conclusion:'success'}]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].pr,5);
  assert.equal(rows[0].prTitle,'A feature');
  assert.equal(rows[0].status,'success');
  assert.equal(rows[0].isDemo,false);
});
test('no status signal is neutral; never infer success',()=>{
  assert.equal(actionStatus(null),'neutral');
  assert.equal(actionStatus({status:'completed',conclusion:'failure'}),'failed');
  assert.equal(actionStatus({status:'in_progress'}),'running');
});
test('failed upstream request throws; never falls back to mock data',async()=>{
  const fake=async()=>({ok:false,status:403,json:async()=>({message:'rate limit'})});
  await assert.rejects(()=>loadRollbackHistory({fetcher:fake}),/GitHub API 403/);
});
test('bad commit SHA rejected before any network request',async()=>{
  await assert.rejects(()=>loadRollbackDetail({sha:'bad'}),/SHA/);
});
test('endpoint returns 100 maximum and only validated live API data',async()=>{
  const sha='b'.repeat(40);
  const fake=async(url)=>{
    const data=url.includes('/commits?')?[{sha,commit:{message:'hi',committer:{date:'2026-11-07T02:00:00Z'}}}]:
      url.includes('/pulls?')?[]: {workflow_runs:[]};
    return {ok:true,status:200,json:async()=>data};
  };
  const value=await loadRollbackHistory({fetcher:fake});
  assert.equal(value.source,'github');
  assert.equal(value.rows.length,1);
  assert.equal(value.historyLimit,100);
});

test('standalone dashboard JavaScript parses; no mock fallback; 5-minute/manual sync',()=>{
  const html=readFileSync(new URL('../public/rollback-dashboard/index.html', import.meta.url),'utf8');
  const source=html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(source,'Single-file dashboard must include JavaScript');
  assert.doesNotThrow(()=>new Script(source[1]));
  assert.doesNotMatch(html,/const DEMO\s*=/);
  assert.doesNotMatch(html,/mockData\s*\(/);
  assert.match(html,/setInterval\(\(\)=>\{if\(!document\.hidden\)refresh\(\)\},REFRESH_MS\)/);
  assert.match(html,/↻ Đồng bộ ngay/);
  assert.match(html,/\/api\/rollback-history\?branch=/);
  assert.match(html,/Rollback đang bị khóa/);
});

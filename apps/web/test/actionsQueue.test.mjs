import test from 'node:test';
import assert from 'node:assert/strict';
import {loadActionsQueue, summarizeActionsQueue} from '../src/services/actionsQueue.mjs';

const run = (id,status,conclusion=null,extra={}) => ({
  id,status,conclusion,name:'Workflow '+id,created_at:'2026-11-07T00:00:00Z',
  head_sha:'abc1234abcdef',head_commit:{message:'feat: sample'},...extra
});

test('includes all workflow names, not a single workflow or deploy filter', () => {
  const summary = summarizeActionsQueue({
    total_count:105,workflow_runs:[
      run(1,'queued',null,{name:'Build',created_at:'2026-11-07T00:01:00Z'}),
      run(2,'in_progress',null,{name:'Deploy'}),
      run(3,'waiting',null,{name:'CI'}),
      run(4,'requested',null,{name:'Workflow dispatch'}),
      run(5,'pending',null,{name:'Test'}),
      run(6,'completed','success',{name:'Release'})
    ]
  });
  assert.equal(summary.queuedCount,4);
  assert.equal(summary.runningCount,1);
  assert.equal(summary.active.length,5);
  assert.equal(summary.active[0].name,'Deploy');
  assert.equal(summary.recent[0].name,'Release');
  assert.equal(summary.hasMoreHistory,true);
  assert.match(summary.active[0].url,/\/actions\/runs\/2$/);
});

test('completed runs never masquerade as running or queued, even if failed', () => {
  const summary = summarizeActionsQueue({total_count:3,workflow_runs:[
    run(1,'completed','failure'),run(2,'completed','skipped'),run(3,'completed','cancelled')
  ]});
  assert.equal(summary.runningCount,0);
  assert.equal(summary.queuedCount,0);
  assert.equal(summary.active.length,0);
  assert.equal(summary.recent.length,2);
});

test('list is capped to fit a narrow sidebar and count remains accurate', () => {
  const runs = Array.from({length:9},(_,i)=>run(i+1,'queued'));
  const summary = summarizeActionsQueue({workflow_runs:runs,total_count:9});
  assert.equal(summary.queuedCount,9);
  assert.equal(summary.active.length,5);
  assert.equal(summary.hiddenActiveCount,4);
});

test('fetches repository-wide actions, handles malformed responses',async () => {
  let url;
  const result = await loadActionsQueue({fetcher:async input=>{
    url=input;
    return new Response(JSON.stringify({workflow_runs:[run(10,'in_progress')],total_count:1}),{status:200});
  }});
  assert.match(url,/\/actions\/runs\?per_page=100$/);
  assert.equal(result.runningCount,1);
  assert.throws(()=>summarizeActionsQueue({workflow_runs:null}),/không hợp lệ/);
});

test('rate-limited responses yield an error, not a fake empty queue',async () => {
  await assert.rejects(()=>loadActionsQueue({fetcher:async()=>new Response('',{status:403})}),/giới hạn/);
});

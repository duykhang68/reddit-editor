import test from 'node:test';
import assert from 'node:assert/strict';
import {loadQueue,persistQueue,enqueue,nextJob,updateJob} from '../src/wikipedia-writer/queue.js';
function store(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};}
test('FIFO retains insertion order and processes one pending job',()=>{
 let jobs=enqueue([], 'https://vi.wikipedia.org/wiki/H%C3%A0_N%E1%BB%99i','auto');
 jobs=enqueue(jobs,'https://vi.wikipedia.org/wiki/Vi%E1%BB%87t_Nam','gemini');
 assert.equal(nextJob(jobs).id,jobs[0].id);
 jobs=updateJob(jobs,jobs[0].id,{status:'running'});
 assert.equal(nextJob(jobs).id,jobs[1].id);
 jobs=updateJob(jobs,jobs[0].id,{status:'done',result:{title:'A',article:'B',vocabulary:[]}});
 assert.equal(jobs[0].result.title,'A');
});
test('duplicate pending URL rejected but completed URL may be queued again',()=>{
 const url='https://en.wikipedia.org/wiki/History';
 let jobs=enqueue([],url,'auto');
 assert.throws(()=>enqueue(jobs,url,'auto'),/đang nằm/);
 jobs=updateJob(jobs,jobs[0].id,{status:'done'});
 assert.equal(enqueue(jobs,url,'auto').length,2);
});
test('storage reload resumes interrupted job; does not store API credentials',()=>{
 const storage=store();
 const jobs=updateJob(enqueue([],'https://en.wikipedia.org/wiki/Science','groq'),'none',{});
 const running=updateJob(jobs,jobs[0].id,{status:'running'});
 persistQueue(storage,running);
 assert.equal(loadQueue(storage)[0].status,'queued');
 assert.equal(storage.getItem('duy-wikipedia-writer-queue-v1').includes('gsk_'),false);
});
test('corrupt storage degrades to empty queue',()=>{
 const storage=store();storage.setItem('duy-wikipedia-writer-queue-v1','{bad');
 assert.deepEqual(loadQueue(storage),[]);
});

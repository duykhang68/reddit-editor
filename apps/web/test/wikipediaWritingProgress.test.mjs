import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateGemini,generateGroq} from '../src/wikipedia-writer/aiModelDiscovery.js';

const ok=data=>({ok:true,json:async()=>data});
const fakeGemini=async(url)=>{
 if(url.includes('pageSize='))return ok({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}]});
 return ok({candidates:[{content:{parts:[{text:'{"title":"A","article":"B","vocabulary":[]}'}]}}]});
};
test('Gemini emits discovery then generation with the actual attempted model',async()=>{
 const events=[];
 await generateGemini('fake','prompt',fakeGemini,event=>events.push(event));
 assert.deepEqual(events.map(x=>x.type),['discovery','generation']);
 assert.equal(events[1].model,'gemini-3.8-flash');
});
test('Groq exposes retry state before trying a second authorized model',async()=>{
 const events=[];
 const fetcher=async(url,opts)=>{
  if(url.endsWith('/models'))return ok({data:[{id:'qwen/qwen3.8-27b',active:true},{id:'openai/gpt-oss-120b',active:true}]});
  if(JSON.parse(opts.body).model==='qwen/qwen3.8-27b')return {ok:false,status:403,json:async()=>({error:{message:'denied'}})};
  return ok({choices:[{message:{content:'{"title":"A","article":"B","vocabulary":[]}'}}]});
 };
 await generateGroq('fake','prompt',fetcher,event=>events.push(event));
 assert.deepEqual(events.map(x=>x.type),['discovery','generation','retry','generation']);
 assert.equal(events.at(-1).model,'openai/gpt-oss-120b');
});
test('Section 3 is adjacent to draft column and preserves vocabulary as section 4',()=>{
 const ui=readFileSync(new URL('../src/wikipedia-writer/Writer.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/wikipedia-writer/writer.css',import.meta.url),'utf8');
 assert.match(ui,/WRITING_STAGES/);
 assert.match(ui,/aria-valuenow=\{writingProgress.completed\}/);
 assert.match(ui,/role="progressbar"/);
 assert.match(ui,/Thanh tiến độ/);
 assert.match(ui,/Không hoàn thành/);
 assert.ok(ui.indexOf('Thanh tiến độ')<ui.indexOf('Từ vựng Việt · Hàn · Anh'));
 assert.match(ui,/<span className="ww-step">04<\/span>/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

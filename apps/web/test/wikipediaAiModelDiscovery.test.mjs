import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chooseGeminiModels,chooseGroqModels,generateGemini,generateGroq} from '../src/wikipedia-writer/aiModelDiscovery.js';
const ok=data=>({ok:true,json:async()=>data});
const bad=(status,message)=>({ok:false,status,json:async()=>({error:{message}})});
test('Gemini discovery excludes legacy and non-text models while preferring 3.8',()=>{
 const models=[
 {name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']},
 {name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},
 {name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']},
 {name:'models/gemini-3.8-flash-tts',supportedGenerationMethods:['generateContent']},
 {name:'models/gemini-3.8-live',supportedGenerationMethods:['generateContent']}
 ];
 assert.deepEqual(chooseGeminiModels(models),['gemini-3.8-flash','gemini-3.7-flash']);
});
test('Groq discovery only selects supported active text models',()=>{
 const models=[{id:'llama-3.3-70b-versatile',active:true},{id:'qwen/qwen3.8-27b',active:true},
 {id:'openai/gpt-oss-120b',active:true},{id:'openai/gpt-oss-20b',active:false},
 {id:'whisper-large-v3',active:true}];
 assert.deepEqual(chooseGroqModels(models),['qwen/qwen3.8-27b','openai/gpt-oss-120b']);
});
test('Gemini probes models through API key and retries when account rejects first model',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push(url);
  if(url.includes('/models?pageSize='))return ok({models:[
   {name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']},
   {name:'models/gemini-3.7-flash',supportedGenerationMethods:['generateContent']}]});
  if(url.includes('gemini-3.8-flash'))return bad(403,'not available to this account');
  return ok({candidates:[{content:{parts:[{text:'{"title":"A","article":"B","vocabulary":[]}'}]}}]});
 };
 const result=await generateGemini('example','prompt',fetcher);
 assert.equal(result.model,'gemini-3.7-flash');
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>!x.includes('gemini-2.5-flash')));
});
test('Groq probes key-accessible models and retries after access rejection',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/models'))return ok({data:[{id:'qwen/qwen3.8-27b',active:true},{id:'openai/gpt-oss-120b',active:true}]});
  const body=JSON.parse(options.body);
  if(body.model==='qwen/qwen3.8-27b')return bad(403,'model not accessible');
  return ok({choices:[{message:{content:'{"title":"A","article":"B","vocabulary":[]}'}}]});
 };
 const result=await generateGroq('example','prompt',fetcher);
 assert.equal(result.model,'openai/gpt-oss-120b');
 assert.equal(calls.length,3);
 assert.ok(calls.every(x=>!JSON.stringify(x).includes('llama-3.3-70b-versatile')));
});
test('Wikipedia Writer no longer hardcodes deprecated model IDs',()=>{
 const ui=readFileSync(new URL('../src/wikipedia-writer/Writer.jsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/gemini-2\.5-flash|llama-3\.3-70b-versatile/);
 assert.match(ui,/generateGemini,generateGroq/);
});

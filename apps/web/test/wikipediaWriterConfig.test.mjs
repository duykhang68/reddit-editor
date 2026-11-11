import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readRememberedAiKeys,persistAiKeys,WIKIPEDIA_AI_KEY_STORAGE} from '../src/wikipedia-writer/aiKeyStorage.js';
import {discoverExpenseDriveClientId} from '../src/expenses/driveClientResolver.js';

function storage(){
 const map=new Map();
 return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),map};
}
test('AI keys are not stored unless device storage is explicitly opted in',()=>{
 const local=storage();
 assert.deepEqual(readRememberedAiKeys(local),{remember:false,gemini:'',groq:''});
 assert.equal(persistAiKeys(local,false,'gemini-secret','groq-secret'),true);
 assert.equal(local.getItem(WIKIPEDIA_AI_KEY_STORAGE),null);
 assert.equal(persistAiKeys(local,true,'gemini-secret','groq-secret'),true);
 assert.deepEqual(readRememberedAiKeys(local),{remember:true,gemini:'gemini-secret',groq:'groq-secret'});
 assert.equal(persistAiKeys(local,false,'',''),true);
 assert.equal(local.getItem(WIKIPEDIA_AI_KEY_STORAGE),null);
});
test('malformed, blocked or unavailable storage does not expose keys',()=>{
 const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
 assert.equal(readRememberedAiKeys(blocked).remember,false);
 assert.equal(persistAiKeys(blocked,true,'private','private'),false);
 const local=storage();local.setItem(WIKIPEDIA_AI_KEY_STORAGE,'bad json');
 assert.equal(readRememberedAiKeys(local).remember,false);
});
test('Wikipedia Writer reuses Editor OAuth IDs without dedicated VITE config',async()=>{
 const local=await discoverExpenseDriveClientId({environmentValue:'',storedValue:'saved.apps.googleusercontent.com',fetcher:()=>{throw Error('unexpected fetch')}});
 assert.equal(local.clientId,'saved.apps.googleusercontent.com');
 const backend=await discoverExpenseDriveClientId({environmentValue:'',storedValue:'',fetcher:async()=>({ok:true,json:async()=>({clientId:'backend.apps.googleusercontent.com'})})});
 assert.equal(backend.clientId,'backend.apps.googleusercontent.com');
});
test('Wikipedia UI exposes opt-in, clear control, and shared OAuth discovery',()=>{
 const source=readFileSync(new URL('../src/wikipedia-writer/Writer.jsx',import.meta.url),'utf8');
 assert.match(source,/discoverExpenseDriveClientId/);
 assert.match(source,/EDITOR_DRIVE_CLIENT_KEY/);
 assert.doesNotMatch(source,/Thiếu VITE_GOOGLE_CLIENT_ID trong Cloudflare Pages/);
 assert.match(source,/Lưu API keys trên thiết bị này/);
 assert.match(source,/Xóa khóa đã lưu/);
 assert.match(source,/localStorage/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeVocabulary} from '../src/services/vocabularySheet.mjs';

const html=readFileSync(new URL('../public/vocabulary-insights/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const server=readFileSync(new URL('../functions/[[path]].js',import.meta.url),'utf8');

test('reads the six real Google Sheets columns without dropping hidden rows',()=>{
  const values=[['Việt ','Hàn ','Anh ','Context or Expression','Ngữ pháp ví dụ','Category'],
    ['Xin chào','안녕하세요','Hello','Lời chào','Câu chào','General'],
    ['từ thứ hai','둘째 단어','Second word','', '', '']];
  const rows=normalizeVocabulary(values);
  assert.equal(rows.length,2);
  assert.equal(rows[0].ko,'안녕하세요');
  assert.equal(rows[1].id,3);
  assert.equal(rows[1].category,'Chưa phân loại');
});

test('rejects a Google Sheet with missing required columns',()=>{
  assert.throws(()=>normalizeVocabulary([['Việt','Hàn','Anh']]),/thiếu/);
});

test('dashboard includes all four sections and UI controls',()=>{
  for(const id of ['sync-title','kb-title','insights-title','flash-title','search','category','pagesize','previous','next','frontlang','deck','flashcard','flip','flash-context','flash-grammar'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/value="3">3 dòng/);
  assert.match(html,/180000/);
  assert.match(html,/textContent/);
  assert.doesNotMatch(html,/innerHTML\s*=/);
});

test('Editor shortcut and authenticated API are wired',()=>{
  assert.match(app,/href: '\/vocabulary-insights\/'/);
  assert.match(server,/pathname==='\/api\/vocabulary-sheet'/);
  assert.match(server,/GOOGLE_SERVICE_ACCOUNT_JSON/);
  assert.doesNotMatch(html,/PRIVATE KEY|client_secret|GOOGLE_SERVICE_ACCOUNT_JSON/);
});

test('Google sign-in is reachable after a 401 and returns to vocabulary insights',()=>{
  const cloud=readFileSync(new URL('../functions/[[path]].js',import.meta.url),'utf8');
  const local=readFileSync(new URL('../../server/index.mjs',import.meta.url),'utf8');
  assert.match(html,/id="google-login" href="\/auth\/google\/start\?return_to=vocabulary-insights"/);
  assert.match(html,/if\(res.status===401\)[^\n]*showLogin\(true\)/);
  assert.match(html,/showLogin\(false\)/);
  for (const source of [cloud,local]){
    assert.match(source,/url\.searchParams\.get\('return_to'\)==='vocabulary-insights'\?'\/vocabulary-insights\/'/);
    assert.match(source,/\['\/quality-gate','\/research-insights\.html'[^\]]*'\/vocabulary-insights\/'\]/);
  }
});

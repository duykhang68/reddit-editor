import test from 'node:test';
import assert from 'node:assert/strict';
import {createDriveService, DRIVE_SCOPE} from '../src/services/googleDriveService.js';
const clientId = '123-test.apps.googleusercontent.com';
function fixture(responses = [], granted = true) {
  let clock = 1000, settings;
  const calls = [], prompts = [];
  const service = createDriveService({
    now: () => clock,
    oauth: () => ({initTokenClient: options => {settings = options; return {requestAccessToken: request => {prompts.push(request); options.callback({access_token:'test-only', expires_in:3600}); }};}, hasGrantedAllScopes: () => granted}),
    fetcher: async (url, options) => {calls.push({url:String(url), ...options}); const response = responses.shift(); if (!response) throw new Error('Unexpected request'); return response;}
  });
  return {service, calls, advance: () => {clock += 3600000;}, settings: () => settings, prompts};
}
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json', ...headers}});
test('requires login; expires without making API calls', async () => {
  const f = fixture();
  await assert.rejects(f.service.listBlogPosts(), /chưa kết nối/);
  await f.service.login(clientId); assert.equal(f.settings().scope, DRIVE_SCOPE);
  assert.equal(f.service.connected(), true); f.advance();
  await assert.rejects(f.service.listBlogPosts(), /hết hạn/); assert.equal(f.calls.length, 0);
});
test('refuses partial permission', async () => {
  const f = fixture([], false); await assert.rejects(f.service.login(clientId), /chưa cấp quyền/); assert.equal(f.service.connected(), false);
});
test('lists all pages', async () => {
  const f = fixture([json({files:[{id:'1'}],nextPageToken:'second'}),json({files:[{id:'2'}]})]);
  await f.service.login(clientId); assert.equal((await f.service.listBlogPosts()).length, 2);
  assert.match(f.calls[1].url, /pageToken=second/); assert.equal(f.calls[0].headers.Authorization, 'Bearer test-only');
});
test('creates related multipart and updates SAME id with conditional PATCH', async () => {
  const f = fixture([json({id:'one',name:'Tiếng Việt.md',version:'1'},200,{etag:'v1'}),json({id:'one',version:'1'}),json({id:'one',version:'2'},200,{etag:'v2'})]);
  await f.service.login(clientId);
  const file = await f.service.saveMarkdownToDrive('Tiếng Việt','## Xin chào');
  assert.equal(f.calls[0].method, 'POST'); assert.match(f.calls[0].headers['Content-Type'], /^multipart\/related/);
  assert.match(await f.calls[0].body.text(), /Tiếng Việt.md/); assert.match(await f.calls[0].body.text(), /## Xin chào/);
  await f.service.saveMarkdownToDrive('Tiếng Việt','Sửa',file);
  assert.equal(f.calls[2].method,'PATCH'); assert.match(f.calls[2].url, /files\/one\?/); assert.equal(f.calls[2].headers['If-Match'],'v1');
});
test('refuses updates without revision and reports conflicts', async () => {
  const f = fixture([json({id:'one',version:'1'}),json({error:{message:'Changed'}},412)]); await f.service.login(clientId);
  await assert.rejects(f.service.saveMarkdownToDrive('x','x',{id:'one'}), /mở lại/i);
  assert.equal(f.calls.length,0);
  await assert.rejects(f.service.saveMarkdownToDrive('x','x',{id:'one',version:'1',etag:'old'}), /thay đổi/);
});
test('401 clears token, 403 gives configuration hint', async () => {
  for (const code of [401,403]) {
    const f=fixture([json({error:{message:'Denied'}},code)]);await f.service.login(clientId);
    await assert.rejects(f.service.listBlogPosts(), code===401?/Kết nối Drive lại/:/Drive API/);
    assert.equal(f.service.connected(),code!==401);
  }
});
test('reads file metadata and media', async () => {
  const f=fixture([json({id:'one',name:'x.md'},200,{etag:'v1'}),new Response('# hello')]);await f.service.login(clientId);
  const file=await f.service.readMarkdown('one');assert.equal(file.content,'# hello');assert.equal(file.etag,'v1');assert.match(f.calls[1].url,/alt=media/);
});
test('version fallback prevents stale updates when CORS hides etag', async () => {
  const f=fixture([json({id:'one',version:'1'}),json({id:'one',version:'2'})]);await f.service.login(clientId);
  const file=await f.service.saveMarkdownToDrive('x','x');assert.equal(file.etag,null);
  await assert.rejects(f.service.saveMarkdownToDrive('x','changed',file),/thay đổi/);
  assert.equal(f.calls.length,2);
});
test('updates same file using version when etag is unavailable', async () => {
  const f=fixture([json({id:'one',version:'1'}),json({id:'one',version:'2'})]);await f.service.login(clientId);
  const file=await f.service.saveMarkdownToDrive('x','changed',{id:'one',version:'1'});
  assert.equal(file.version,'2');assert.equal(f.calls[1].method,'PATCH');
});

test('routine reconnect does not force consent or account picker', async () => {
  const f = fixture();
  await f.service.login(clientId);
  await f.service.login(clientId);
  assert.deepEqual(f.prompts, [{prompt:''},{prompt:''}]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
test('Cloudflare route handler and local API pass JavaScript syntax preflight',()=>{
 for(const file of ['functions/[[path]].js','../server/index.mjs']){
  assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',resolve(root,file)],{encoding:'utf8'}),file);
 }
});
test('Blogger PATCH/DELETE post route matches numeric IDs only',()=>{
 const source=readFileSync(resolve(root,'functions/[[path]].js'),'utf8');
 const pattern='/^\\/api\\/posts\\/\\d+$/';
 assert.ok(source.includes(pattern+'.test(pathname)'), 'Expected properly escaped JavaScript regex literal');
 const match=/^\/api\/posts\/\d+$/;
 assert.equal(match.test('/api/posts/123456'),true);
 assert.equal(match.test('/api/posts/abc'),false);
 assert.equal(match.test('/api/posts/123/other'),false);
});

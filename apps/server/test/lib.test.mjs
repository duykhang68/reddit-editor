import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveKey,seal,unseal,randomToken,codeChallenge,normalizeInput,numericId,readCookies,secureEquals} from '../lib.mjs';
test('Session AES-GCM encrypt/decrypt and wrong key rejection',()=>{
  const k=deriveKey('a'.repeat(64)),other=deriveKey('b'.repeat(64));
  const data={secret:'refresh_token_fake',sessions:[1,2]};const encoded=seal(data,k);
  assert.ok(!encoded.includes('refresh_token_fake'));
  assert.deepEqual(unseal(encoded,k),data);
  assert.throws(()=>unseal(encoded,other));
});
test('OAuth PKCE and random tokens',()=>{
  const v=randomToken(48);assert.match(v,/^[A-Za-z0-9_-]{50,}$/);
  assert.match(codeChallenge(v),/^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(codeChallenge(v),codeChallenge(randomToken(48)));
});
test('Post input validation and deduplicated labels',()=>{
  assert.deepEqual(normalizeInput({title:'  Xin chào  ',content:'<p>Xin chào</p>',labels:[' SEO ','SEO','Công nghệ']}),{title:'Xin chào',content:'<p>Xin chào</p>',labels:['SEO','Công nghệ']});
  assert.throws(()=>normalizeInput({title:'',content:'',labels:[]}));
  assert.throws(()=>normalizeInput({title:'Hi',content:'',labels:'wrong'}));
  assert.throws(()=>numericId('23/45'));
  assert.equal(numericId('1346670730934460908'),'1346670730934460908');
});
test('CSRF comparisons and cookie parsing',()=>{
  assert.equal(secureEquals('valid','valid'),true);
  assert.equal(secureEquals('valid','invalid'),false);
  assert.equal(readCookies('x=y; dn_editor_session=abc').dn_editor_session,'abc');
});

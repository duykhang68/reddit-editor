import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePublishDate} from '../lib.mjs';
test('Server permits future explicit-offset RFC3339 schedule only',()=>{
  const now=Date.parse('2026-11-07T00:00:00Z');
  assert.equal(validatePublishDate('2026-11-08T09:00:00+07:00',now),'2026-11-08T09:00:00+07:00');
  assert.throws(()=>validatePublishDate('2026-11-06T09:00:00+07:00',now),{status:400});
  assert.throws(()=>validatePublishDate('2026-11-08T09:00:00',now),{status:400});
  assert.throws(()=>validatePublishDate('nonsense',now),{status:400});
});

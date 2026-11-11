import test from 'node:test';
import assert from 'node:assert/strict';
import { makeOutboundBudget, googleQuotaError, MAX_EXTERNAL_CALLS_PER_REQUEST } from '../src/services/freeQuotaPolicy.mjs';

test('per-invocation outbound budget stops before call 5', () => {
  const charge = makeOutboundBudget();
  for (let i = 0; i < MAX_EXTERNAL_CALLS_PER_REQUEST; i++) assert.doesNotThrow(charge);
  assert.throws(charge, e => e.status === 429 && e.retryAfter === '60');
});
test('Google quota errors fail closed without retries', () => {
  assert.equal(googleQuotaError(429, {})?.status, 429);
  assert.equal(googleQuotaError(403, {error:{errors:[{reason:'rateLimitExceeded'}]}})?.status, 429);
  assert.equal(googleQuotaError(403, {error:{status:'RESOURCE_EXHAUSTED'}})?.status, 429);
  assert.equal(googleQuotaError(403, {error:{message:'Access denied'}}), null);
  assert.equal(googleQuotaError(500, {error:{message:'Internal'}}), null);
});
test('invalid budget fails rather than accidentally permitting unlimited calls', () => {
  assert.throws(() => makeOutboundBudget(Infinity));
  assert.throws(() => makeOutboundBudget(0));
});

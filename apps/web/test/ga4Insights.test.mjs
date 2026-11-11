import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/ga4-insights.js';

function request(key='') {
 return new Request('https://duynguyen-reddit-editor.pages.dev/api/ga4-insights?days=30',{
  headers:key?{'x-dashboard-key':key}:{}
 });
}

test('GA4 Insights fails closed when access secret is not configured',async()=>{
 const response=await onRequestGet({request:request(),env:{}});
 assert.equal(response.status,503);
 assert.equal((await response.json()).code,'GA4_DASHBOARD_LOCKED');
});

test('GA4 Insights denies unauthorized viewers before Google API',async()=>{
 const response=await onRequestGet({request:request('wrong'),env:{GA4_INSIGHTS_ACCESS_KEY:'correct'}});
 assert.equal(response.status,401);
 assert.equal((await response.json()).code,'GA4_UNAUTHORIZED');
});

test('GA4 Insights reports missing credentials only for authorized user',async()=>{
 const response=await onRequestGet({request:request('correct'),env:{GA4_INSIGHTS_ACCESS_KEY:'correct'}});
 assert.equal(response.status,503);
 assert.equal((await response.json()).code,'GA4_NOT_CONFIGURED');
});

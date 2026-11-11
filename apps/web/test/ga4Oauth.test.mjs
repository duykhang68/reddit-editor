import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/[[path]].js';

const base = 'https://editor.example';
const env = {
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'fake-only',
  GOOGLE_REDIRECT_URI: base + '/auth/google/callback',
  FRONTEND_ORIGIN: base,
  APP_SECRET: 'a'.repeat(64),
  GA4_PROPERTY_ID: '4567'
};
const response = (body, status = 200) => new Response(JSON.stringify(body), {status});
test('GA4 endpoint is private; Blogger OAuth alone does not silently grant Analytics', async t => {
  const mocked = t.mock.method(globalThis, 'fetch', async url => {
    const u = String(url);
    if (u === 'https://oauth2.googleapis.com/token')
      return response({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600,scope:'https://www.googleapis.com/auth/blogger'});
    throw Error('Unexpected URL: ' + u);
  });
  const call = (url, cookie = '') => onRequest({request: new Request(base + url,{headers:cookie?{Cookie:cookie}:{}}),env});
  try {
    assert.equal((await call('/api/ga4-traffic')).status, 401);
    const status = await call('/api/status');
    const cookie = status.headers.get('Set-Cookie').split(';')[0];
    const start = await call('/auth/google/start?return_to=research-insights',cookie);
    const url = new URL(start.headers.get('location'));
    assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/blogger');
    const flowCookie = start.headers.get('Set-Cookie').split(';')[0];
    const callback = await call('/auth/google/callback?state='+url.searchParams.get('state')+'&code=test',flowCookie);
    const connectedCookie = callback.headers.get('Set-Cookie').split(';')[0];
    const traffic = await call('/api/ga4-traffic',connectedCookie);
    assert.equal(traffic.status,200);
    assert.deepEqual(await traffic.json(),{status:'needs_consent'});
    assert.equal(mocked.mock.callCount(),1);
  } finally {mocked.mock.restore();}
});
test('opt-in Analytics OAuth can read only verified GA4 stream with no token exposure', async t => {
  const calls = [];
  const mocked = t.mock.method(globalThis,'fetch',async (url, options={}) => {
    const u=String(url);
    calls.push(u);
    if(u==='https://oauth2.googleapis.com/token')
      return response({access_token:'access-not-public',refresh_token:'refresh-not-public',expires_in:3600,
        scope:'https://www.googleapis.com/auth/blogger https://www.googleapis.com/auth/analytics.readonly'});
    if(u.endsWith('/properties/4567/dataStreams/16289663503'))
      return response({name:'properties/4567/dataStreams/16289663503',
        webStreamData:{measurementId:'G-Z83BHS8KMY',defaultUri:'https://duynguyen99.blogspot.com'}});
    if(u.endsWith(':runReport'))
      return response({metricHeaders:[{name:'activeUsers'},{name:'sessions'},{name:'screenPageViews'}],
        rows:[{metricValues:[{value:'10'},{value:'18'},{value:'35'}]}]});
    if(u.endsWith(':runRealtimeReport'))
      return response({metricHeaders:[{name:'activeUsers'}],rows:[{metricValues:[{value:'2'}]}]});
    throw Error('Unexpected URL: '+u);
  });
  const call=(url,cookie='')=>onRequest({request:new Request(base+url,{headers:cookie?{Cookie:cookie}:{}}),env});
  try {
    const status=await call('/api/status'),cookie=status.headers.get('Set-Cookie').split(';')[0];
    const start=await call('/auth/google/start?return_to=research-insights&analytics=1',cookie);
    const google=new URL(start.headers.get('Location'));
    assert.match(google.searchParams.get('scope'),/analytics\.readonly/);
    const flowCookie=start.headers.get('Set-Cookie').split(';')[0];
    const callback=await call('/auth/google/callback?state='+google.searchParams.get('state')+'&code=test',flowCookie);
    assert.equal(callback.status,302);
    assert.equal(callback.headers.get('Location'),base+'/research-insights.html?connected=1');
    const cookie2=callback.headers.get('Set-Cookie').split(';')[0];
    const result=await call('/api/ga4-traffic',cookie2);
    const snapshot=await result.json();
    assert.equal(result.status,200);
    assert.equal(snapshot.status,'connected');
    assert.equal(snapshot.metrics.activeUsers7d,10);
    assert.equal(snapshot.metrics.activeUsers30m,2);
    assert.equal(JSON.stringify(snapshot).includes('not-public'),false);
    assert.equal(calls.length,4);
    assert.equal(mocked.mock.callCount(),4);
  }finally{mocked.mock.restore();}
});

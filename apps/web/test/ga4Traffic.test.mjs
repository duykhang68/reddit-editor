import test from 'node:test';
import assert from 'node:assert/strict';
import {loadGa4Traffic, parseGa4Metrics, GA4_STREAM_ID, GA4_MEASUREMENT_ID} from '../src/services/ga4Traffic.mjs';

const report = {
  metricHeaders: [{name: 'activeUsers'}, {name: 'sessions'}, {name: 'screenPageViews'}],
  rows: [{metricValues: [{value: '17'}, {value: '25'}, {value: '70'}]}]
};
const realtime = {metricHeaders: [{name: 'activeUsers'}], rows: [{metricValues: [{value: '3'}]}]};
const stream = {name: 'properties/4567/dataStreams/' + GA4_STREAM_ID, webStreamData: {
  measurementId: GA4_MEASUREMENT_ID, defaultUri: 'https://duynguyen99.blogspot.com/'
}};
const response = (body, code = 200) => new Response(JSON.stringify(body), {status: code, headers: {'Content-Type': 'application/json'}});
const fake = calls => async (url, options = {}) => {
  const u = String(url);
  calls.push({url: u, method: options.method, body: options.body && JSON.parse(options.body)});
  if (u.includes('/accountSummaries')) return response({accountSummaries: [{propertySummaries: [
    {property: 'properties/9999', displayName: 'Other site'},
    {property: 'properties/4567', displayName: 'duynguyen99.blogspot.com'}
  ]}]});
  if (u.includes('properties/4567/dataStreams/')) return response(stream);
  if (u.includes('dataStreams/')) return response({}, 404);
  if (u.endsWith(':runReport')) return response(report);
  if (u.endsWith(':runRealtimeReport')) return response(realtime);
  return response({error: {message: 'Unexpected mock URL'}}, 500);
};
test('empty GA4 OAuth session is not mistaken for zero visitors', async () => {
  const data = await loadGa4Traffic({token: ''});
  assert.equal(data.status, 'needs_consent');
  assert.equal(data.metrics, undefined);
});
test('discover property, verify exact web stream and read both GA4 reporting windows', async () => {
  const calls = [];
  const data = await loadGa4Traffic({fetcher: fake(calls), token: 'private-token', now: () => Date.parse('2026-11-07T01:00:00Z')});
  assert.equal(data.status, 'connected');
  assert.equal(data.propertyId, '4567');
  assert.deepEqual(data.metrics, {activeUsers7d: 17, sessions7d: 25, pageViews7d: 70, activeUsers30m: 3});
  assert.equal(data.updatedAt, '2026-11-07T01:00:00.000Z');
  assert.equal(calls.length, 4);
  assert.equal(calls.filter(c => c.url.includes('dataStreams/')).length, 1);
  const core = calls.find(c => c.url.endsWith(':runReport')).body;
  const real = calls.find(c => c.url.endsWith(':runRealtimeReport')).body;
  assert.equal(core.dimensionFilter.filter.stringFilter.value, GA4_STREAM_ID);
  assert.equal(real.dimensionFilter.filter.stringFilter.value, GA4_STREAM_ID);
  assert.deepEqual(core.dateRanges, [{startDate:'6daysAgo', endDate:'today'}]);
  assert.equal(calls.some(c => c.url.includes('private-token')), false);
});
test('configured property never falls back to a different stream', async () => {
  let runs = 0;
  const result = await loadGa4Traffic({token: 'test', propertyId: '9999', fetcher: async () => {runs++;return response({}, 404);}});
  assert.equal(result.status, 'needs_property');
  assert.equal(runs, 1);
});
test('invalid Property ID is not confused with Measurement or Stream ID', async () => {
  const r = await loadGa4Traffic({token:'test', propertyId: 'G-Z83BHS8KMY'});
  assert.equal(r.status, 'needs_property');
});
test('Google Analytics read permission error is not silently reported as zero', async () => {
  const r = await loadGa4Traffic({token:'test', propertyId:'4567', fetcher: async () => response({error:{message:'Permission denied'}},403)});
  assert.equal(r.status, 'unavailable');
  assert.equal(r.reason,'no_access');
  assert.equal(r.metrics,undefined);
});
test('Google Analytics API not enabled is identified clearly', async () => {
  const r = await loadGa4Traffic({token:'test', propertyId:'4567', fetcher: async () => response({error:{message:'Google Analytics Admin API has not been used in project or it is disabled'}},403)});
  assert.equal(r.reason,'api_disabled');
});
test('empty core and realtime reports represent confirmed zero, not inferred pageviews', () => {
  assert.deepEqual(parseGa4Metrics(
    {metricHeaders: report.metricHeaders, rows: []},
    {metricHeaders: realtime.metricHeaders, rows: []}
  ), {activeUsers7d:0,sessions7d:0,pageViews7d:0,activeUsers30m:0});
});

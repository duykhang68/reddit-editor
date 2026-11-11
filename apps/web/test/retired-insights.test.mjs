import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('retired Insights cards and navigation are absent from Editor', () => {
  const app = read('../src/App.jsx');
  for (const title of ['Research Insights', 'CI / Quality Gate Insights', 'Collector Insights']) {
    assert.doesNotMatch(app, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(app, /href="\/quality-gate"/);
  assert.match(app, /Starbucks Rewards & Insights/);
});

test('retired Insights standalone pages are not built or routed', () => {
  const entry = read('../src/main.jsx');
  const vite = read('../vite.config.js');
  assert.doesNotMatch(entry, /QualityGateInsights/);
  assert.doesNotMatch(vite, /researchInsights/);
  for (const file of ['../research-insights.html', '../public/collector/index.html', '../src/QualityGateInsights.jsx']) {
    assert.equal(existsSync(new URL(file, import.meta.url)), false);
  }
});

test('retired Insights APIs no longer fetch GitHub data', () => {
  for (const source of ['../../server/index.mjs', '../functions/[[path]].js']) {
    const text = read(source);
    assert.doesNotMatch(text, /pathname===['"]\/api\/(?:research-insights|quality-gate)['"]/);
    assert.doesNotMatch(text, /url\.pathname===['"]\/api\/(?:research-insights|quality-gate)['"]/);
  }
});

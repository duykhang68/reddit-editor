import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySeries, editableSeries, normalizeSeries, seriesValidation, seriesProgress,
  daysUntilTarget, withSeriesHTML, extractSeriesFromHTML, seriesFrontmatter, consumeSeriesFrontmatter
} from '../src/services/series.js';

const value={enabled:true,name:'Làm chủ CI/CD: "A–Z" 🚀',part:3,total_parts:12,target_date:'2026-12-31'};
test('Series progress, status and date countdown are deterministic',()=>{
  assert.equal(seriesProgress(value),25);
  assert.equal(normalizeSeries(value).status,'in_progress');
  assert.equal(normalizeSeries({...value,part:12}).status,'completed');
  assert.equal(seriesProgress({...value,part:12}),100);
  assert.equal(daysUntilTarget('2026-11-10',new Date(2026,10,7)),3);
  assert.equal(daysUntilTarget('2026-11-07',new Date(2026,10,7)),0);
  assert.equal(daysUntilTarget('2026-11-06',new Date(2026,10,7)),-1);
});
test('Reject invalid series numbers and dates; disabled mode does not mutate post content',()=>{
  assert.match(seriesValidation({...value,name:'   '}),/tên/);
  assert.match(seriesValidation({...value,part:13}),/lớn hơn/);
  assert.match(seriesValidation({...value,part:1.5}),/số nguyên/);
  assert.match(seriesValidation({...value,target_date:'2026-02-30'}),/Ngày kết thúc/);
  assert.equal(withSeriesHTML('<p>Hello</p>',emptySeries()),'<p>Hello</p>');
  assert.equal(seriesFrontmatter(emptySeries()),'');
});
test('Blogger HTML series marker survives round trip and does not duplicate',()=>{
  const html='<h2>Hello</h2><p>text</p>';
  const encoded=withSeriesHTML(html,value);
  assert.match(encoded,/data-kind="series-metadata"/);
  assert.doesNotMatch(encoded,/<script|\bonclick=/i);
  const extracted=extractSeriesFromHTML(encoded);
  assert.equal(extracted.html,html);
  assert.deepEqual(normalizeSeries(extracted.series),normalizeSeries(value));
  assert.equal(withSeriesHTML(encoded,value),encoded);
  assert.equal(withSeriesHTML(encoded,emptySeries()),html);
});
test('Series YAML frontmatter exports exact schema and imports metadata',()=>{
  const front=seriesFrontmatter(value);
  assert.match(front,/^---\nseries:\n/);
  assert.match(front,/  name: "Làm chủ CI\/CD: \\"A–Z\\" 🚀"/);
  assert.match(front,/  part: 3\n/);
  assert.match(front,/  total_parts: 12\n/);
  assert.match(front,/  target_date: "2026-12-31"\n/);
  assert.match(front,/  status: "in_progress"\n/);
  const parsed=consumeSeriesFrontmatter(front+'<!-- duy-editor:{"title":"Post"} -->\n\n# Post\n');
  assert.deepEqual(normalizeSeries(parsed.series),normalizeSeries(value));
  assert.match(parsed.content,/^<!-- duy-editor:/);
  assert.deepEqual(consumeSeriesFrontmatter('# Legacy\n').series,emptySeries());
});
test('Malformed frontmatter or Blogger marker cannot crash hydration',()=>{
  assert.equal(consumeSeriesFrontmatter('---\nseries:\n  name: nope\n---\n').series.enabled,false);
  assert.equal(extractSeriesFromHTML('<aside data-kind="series-metadata" data-series="bad%"></aside><p>Body</p>').html,'<p>Body</p>');
  assert.deepEqual(editableSeries(null),emptySeries());
});

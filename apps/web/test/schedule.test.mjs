import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleLocalToIso,formatScheduleInZone,scheduleFrontmatter,parseScheduleFrontmatter} from '../src/services/schedule.js';
import {serializeArticle} from '../src/services/markdown.js';
import {consumeSeriesFrontmatter} from '../src/services/series.js';
test('Vietnam timezone schedule preserves publication instant and YAML',()=>{
  const iso=scheduleLocalToIso('2026-11-08T09:00','Asia/Ho_Chi_Minh');
  assert.equal(iso,'2026-11-08T09:00:00+07:00');
  assert.equal(new Date(iso).toISOString(),'2026-11-08T02:00:00.000Z');
  assert.equal(formatScheduleInZone(iso,'Asia/Ho_Chi_Minh'),'2026-11-08T09:00');
  const md=serializeArticle({title:'Ví dụ',labels:'Blog',html:'<p>Xin chào!</p>',schedule:{publishDate:iso,timeZone:'Asia/Ho_Chi_Minh'}});
  assert.match(md,/^---\ndate: 2026-11-08T09:00:00\+07:00\npublishDate: 2026-11-08T09:00:00\+07:00\ndraft: false\nscheduled: true\n---\n/);
  assert.equal(parseScheduleFrontmatter(md).publishDate,iso);
});
test('Schedule metadata and series coexist in ONE YAML frontmatter',()=>{
  const md=serializeArticle({title:'Series',labels:'',html:'<p>Text</p>',
    series:{enabled:true,name:'DevOps',part:1,total_parts:3,target_date:'2026-12-31'},
    schedule:{publishDate:'2026-11-08T09:00:00+07:00',timeZone:'Asia/Ho_Chi_Minh'}});
  assert.equal((md.match(/^---$/gm)||[]).length,2);
  const parsed=consumeSeriesFrontmatter(md);
  assert.equal(parsed.series.name,'DevOps');
  assert.equal(parseScheduleFrontmatter(md).publishDate,'2026-11-08T09:00:00+07:00');
  assert.match(parsed.content,/^<!-- duy-editor:/);
});
test('Reject invalid calendar dates and nonexistent DST wall times',()=>{
  assert.throws(()=>scheduleLocalToIso('2026-02-30T09:00','Asia/Ho_Chi_Minh'),/không tồn tại/);
  assert.throws(()=>scheduleLocalToIso('2026-03-08T02:30','America/New_York'),/không tồn tại/);
  assert.equal(scheduleLocalToIso('2026-01-10T09:00','America/New_York'),'2026-01-10T09:00:00-05:00');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const queue=readFileSync(new URL('../src/components/ScheduledQueue.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/components/ScheduledQueue.css',import.meta.url),'utf8');
test('Scheduled queue appears right beneath the editor within the center workspace column',()=>{
 const first=ui.indexOf('<div className="kit-editor-stack">');
 const paper=ui.indexOf('<section className="kit-paper"',first);
 const queueSection=ui.indexOf('<ScheduledQueue',paper);
 const right=ui.indexOf('<aside className="kit-right"',queueSection);
 assert.ok(first>0&&paper>first&&queueSection>paper&&right>queueSection);
 assert.match(css,/\.kit-editor-stack\{display:grid/);
});
test('Queue reads live Blogger SCHEDULED posts, not unverified localStorage',()=>{
 assert.match(queue,/status:'scheduled'/);
 assert.match(queue,/api\('\/posts\?'\+qs\)/);
 assert.match(queue,/String\(x\.status\)\.toLowerCase\(\)==='scheduled'/);
 assert.doesNotMatch(queue,/loadScheduleCache|localStorage/);
 assert.match(queue,/if\(!connected\|\|!blogId\)/);
 assert.match(queue,/Không xác minh được dữ liệu trực tiếp/);
});
test('Queue supports manual refresh, opening posts and all scheduled posts',()=>{
 assert.match(queue,/↻ Làm mới/);
 assert.match(queue,/onOpen\(item\)/);
 assert.match(queue,/onViewAll/);
 assert.match(ui,/setScheduledQueueRevision\(n=>n\+1\)/);
 assert.match(ui,/setFilter\('scheduled'\);setDraftsOpen\(true\)/);
 assert.match(queue,/90000/);
});
test('Queue handles mobile and accessible empty/error/loading states',()=>{
 assert.match(queue,/aria-labelledby="scheduled-queue-title"/);
 assert.match(queue,/role="alert"/);
 assert.match(queue,/Chưa có bài nào được Blogger xác nhận/);
 assert.match(css,/@media\(max-width:600px\)/);
});

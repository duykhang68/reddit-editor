import test from 'node:test';
import assert from 'node:assert/strict';
import {findDiagramCandidates,makeDrawioXML} from '../src/autoVisualize.js';

test('detects ordered workflows in a Blogger draft',()=>{
  const html='<h2>CI/CD Deployment</h2><ol><li>Checkout repository</li><li>Run tests</li><li>Deploy to Blogger</li></ol>';
  const items=findDiagramCandidates(html);
  assert.equal(items.length,1);
  assert.equal(items[0].steps.length,3);
  const xml=makeDrawioXML(items[0]);
  assert.match(xml,/<mxfile /);
  assert.match(xml,/source="n0" target="n1"/);
  assert.match(xml,/Deploy to Blogger/);
});
test('ignores prose and short lists',()=>{
  const html='<h2>Introduction</h2><p>Plain paragraph.</p><h2>Short list</h2><ul><li>A</li><li>B</li></ul>';
  assert.deepEqual(findDiagramCandidates(html),[]);
});
test('escapes untrusted labels in draw.io XML',()=>{
  const xml=makeDrawioXML({heading:'A & B',steps:['one <script>','two & more','last "quote"']});
  assert.match(xml,/A &amp; B/);
  assert.match(xml,/one &lt;script&gt;/);
  assert.doesNotMatch(xml,/<script>/);
});

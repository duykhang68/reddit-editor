import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const assets = new URL('../public/blogger-assets/', import.meta.url);
const read = name => readFileSync(new URL(name, assets), 'utf8');

test('Blogger CSS override exists and starts without layout-breaking changes', () => {
  const css = read('theme.css');
  assert.match(css, /--dn-blogger-accent:/);
  assert.match(css, /--dn-blogger-content-max-width:/);
  assert.ok(css.length > 150);
});

test('Blogger JS is valid and can initialize safely only once', () => {
  const script = new Script(read('theme.js'), { filename: 'theme.js' });
  const events = [];
  const document = {
    documentElement: { dataset: {} },
    dispatchEvent: event => events.push(event.type)
  };
  const context = {
    document,
    CustomEvent: class { constructor(type) { this.type = type; } }
  };
  script.runInNewContext(context);
  script.runInNewContext(context);
  assert.equal(events.length, 1);
  assert.equal(events[0], 'dn-blogger-assets-ready');
});

test('Version manifest describes the stable Blogger asset paths', () => {
  const manifest = JSON.parse(read('version.json'));
  assert.equal(manifest.repository, 'duykhang68/tetdinhmuiblog');
  assert.deepEqual(manifest.assets, ['theme.css', 'theme.js']);
});

test('Cloudflare cache policy is limited to the Blogger asset directory', () => {
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.match(headers, /^\/blogger-assets\/\*\s*$/m);
  assert.match(headers, /max-age=60/);
  assert.doesNotMatch(headers, /^\/\*\s*$/m);
});

test('Blogger article prose is justified without changing titles or structured blocks', () => {
  const css = read('theme.css');
  assert.match(css, /#main-wrapper\s+\.post-body\s+p:not\(/);
  assert.match(css, /text-align:\s*justify\s*!important/);
  assert.match(css, /text-align-last:\s*start/);
  assert.match(css, /blockquote p, \.hd-quote p, \.hd-callout p, \.hd-note p/);
  assert.match(css, /figcaption p, table p, \.hd-table-wrap p/);
  assert.ok(css.includes("[style*='text-align: center']"));
});

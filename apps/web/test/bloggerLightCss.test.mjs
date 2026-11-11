import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/blogger-assets/theme.css', import.meta.url), 'utf8');

test('light UI keeps brand palette, accessible CTA and HealthDaily selectors', () => {
  assert.match(css, /--tdm-brand:\s*#ff4500/i);
  assert.match(css, /--tdm-action:\s*#c93600/i);
  assert.match(css, /--tdm-canvas:\s*#f2f6f7/i);
  assert.match(css, /\.menu-primary-container/);
  assert.match(css, /\.readmore a/);
  assert.match(css, /\.post-body/);
  assert.match(css, /#copyrights/);
  assert.match(css, /:focus-visible/);
});

test('hotfix does not redefine layout or spacing properties', () => {
  // Deliberately match CSS declarations, not the explanatory comment header.
  assert.doesNotMatch(css, /^\s*(?:min-|max-)?(?:width|height|display|float|grid-template-columns|grid-template-rows|position|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?|font-size)\s*:/m);
});

test('CSS contains no script or secret tokens', () => {
  assert.doesNotMatch(css, /<script|GITHUB_TOKEN|CLIENT_SECRET|api_key/i);
});

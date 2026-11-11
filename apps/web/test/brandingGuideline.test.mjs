import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../public/branding-guideline/index.html', import.meta.url), 'utf8');

test('standalone guideline has its own HTML entry and does not import the editor', () => {
  assert.match(page, /<title>Tet Dinh Mui Branding Guideline<\/title>/);
  assert.match(page, /<main class="main" id="overview">/);
  assert.doesNotMatch(page, /src=["'][^"']*src\/main\.jsx/);
  assert.match(page, /id="sources"/);
});

test('palette contains exactly twelve accessible copyable swatches', () => {
  const swatches = [...page.matchAll(/class="swatch" data-group="(brand|neutral|support)" data-hex="#[0-9A-F]{6}"/g)];
  assert.equal(swatches.length, 12);
  assert.match(page, /data-hex="#FF4500"/);
  assert.match(page, /data-hex="#F2F6F7"/);
  assert.match(page, /id="contrast-result"/);
  assert.match(page, /prefers-reduced-motion/);
  assert.match(page, /redditbrand\.lingoapp\.com\/s\/Color-R7y72J/);
});

test('standalone guideline contains no secrets or external API calls', () => {
  assert.doesNotMatch(page, /fetch\(|localStorage|GITHUB_TOKEN|CLIENT_SECRET/);
});

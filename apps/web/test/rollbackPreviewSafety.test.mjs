import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { annotatePreviewHtml } from '../../../scripts/prepare-pages-preview.mjs';

const html = readFileSync(new URL('../public/rollback-dashboard/index.html', import.meta.url), 'utf8');
const previewCode = readFileSync(new URL('../public/preview-notice.js', import.meta.url), 'utf8');

test('Rollback Dashboard renders at its own route without redirecting to QA', () => {
  assert.match(html, /<title>Rollback ID Dashboard/);
  assert.doesNotMatch(html, /http-equiv\s*=\s*["']refresh["']/i);
  assert.doesNotMatch(html, /duynguyen-rollback-r2-qa\.pages\.dev/);
  assert.match(html, /id="rollbackBtn"/);
});

test('Rollback Dashboard receives a GitHub Pages preview notice', () => {
  const preview = annotatePreviewHtml(html);
  assert.match(preview, /src="\/reddit-editor\/preview-notice\.js"/);
  assert.match(preview, /name="robots" content="noindex,nofollow"/);
});

test('public Pages preview disables rollback tokens and buttons without changing production', () => {
  assert.match(previewCode, /location\.hostname === 'duykhang68\.github\.io'/);
  assert.match(previewCode, /location\.pathname === '\/reddit-editor\/rollback-dashboard\/'/);
  assert.match(previewCode, /querySelectorAll\('input,button,select,textarea'\)/);
  assert.match(previewCode, /control\.disabled = true/);
  assert.match(previewCode, /Không nhập GitHub PAT/);
});

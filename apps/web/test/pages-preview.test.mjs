import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PREVIEW_BASE,
  PREVIEW_ROUTES,
  rewritePreviewNavigation,
  annotatePreviewHtml
} from '../../../scripts/prepare-pages-preview.mjs';

test('Pages preview contains exactly the 12 Editor quick access routes', () => {
  assert.equal(PREVIEW_BASE, '/reddit-editor/');
  assert.equal(PREVIEW_ROUTES.length, 12);
  assert.equal(new Set(PREVIEW_ROUTES).size, 12);
});

test('Pages preview rewrites all internal utility links and home links', () => {
  for (const slug of PREVIEW_ROUTES) {
    assert.equal(
      rewritePreviewNavigation('<a href="/' + slug + '/">Tool</a>'),
      '<a href="/reddit-editor/' + slug + '/">Tool</a>'
    );
    assert.equal(
      rewritePreviewNavigation('href:"/' + slug + '/"'),
      'href:"/reddit-editor/' + slug + '/"'
    );
  }
  assert.equal(rewritePreviewNavigation('<a href="/">Home</a>'),
    '<a href="/reddit-editor/">Home</a>');
  assert.equal(rewritePreviewNavigation('href:"/"'),
    'href:"/reddit-editor/"');
});

test('Pages preview never rewrites protected API/auth or external endpoints', () => {
  const input = [
    'fetch("/api/ga4-insights?days=30")',
    "fetch('/cashflow-intelligence/api/transactions')",
    '<a href="/auth/google/start">Connect</a>',
    'const endpoint = "https://duynguyen-reddit-editor.pages.dev/expenses/";'
  ].join('\n');
  const result = rewritePreviewNavigation(input);
  assert.match(result, /fetch\("\/api\/ga4-insights/);
  assert.match(result, /fetch\('\/cashflow-intelligence\/api\/transactions'\)/);
  assert.match(result, /href="\/auth\/google\/start"/);
  assert.match(result, /https:\/\/duynguyen-reddit-editor.pages.dev\/expenses\//);
});

test('Pages preview transforms are idempotent and add noindex banner only to preview', () => {
  const source = '<!doctype html><html><head></head><body><a href="/">Editor</a></body></html>';
  const preview = annotatePreviewHtml(rewritePreviewNavigation(source));
  assert.match(preview, /name="robots" content="noindex,nofollow"/);
  assert.match(preview, /src="\/reddit-editor\/preview-notice.js"/);
  assert.equal(annotatePreviewHtml(rewritePreviewNavigation(preview)), preview);
});

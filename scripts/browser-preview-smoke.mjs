// Headless, non-destructive browser acceptance for the PUBLIC GitHub Pages preview.
// It never requests Google login, posts to Blogger, or submits financial data.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = 'https://duykhang68.github.io/reddit-editor/';
const ROUTES = [
  'cashflow-intelligence', 'ga4-insights', 'voice-studio', 'typesetting-tools',
  'youtube-subtitle-writer', 'wikipedia-writer', 'rollback-dashboard',
  'vocabulary-insights', 'starbucks-insights', 'highlands-insights',
  'payroll-insights', 'expenses'
];

export async function browserPreviewSmoke() {
  const outDir = 'artifacts/browser-preview';
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const evidence = { routes: [], quickAccess: 0, interactions: [] };

  const visit = async (page, route) => {
    const address = route ? BASE + route + '/' : BASE;
    const response = await page.goto(address, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(response?.status(), 200, 'HTTP status for ' + address);
    await page.locator('aside[aria-label="GitHub Pages preview"]').waitFor({ timeout: 20000 });
    const title = await page.title();
    assert.ok(title.trim().length > 2, 'Page title required: ' + route);
    const text = await page.locator('body').innerText();
    assert.ok(text.trim().length > 80, 'Page should display meaningful HTML: ' + route);
    assert.ok(!text.includes('Application error: a client-side exception has occurred'),
      'Broken application: ' + route);
    await page.screenshot({
      path: outDir + '/' + (route || 'editor') + '.png',
      fullPage: false,
      animations: 'disabled'
    });
    evidence.routes.push({ route: route || 'editor', status: 200, title });
  };

  try {
    const root = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await visit(root, '');
    const links = root.locator('.kit-quick-link');
    evidence.quickAccess = await links.count();
    assert.equal(evidence.quickAccess, ROUTES.length, 'Editor must expose exactly 12 quick links');
    const targets = await links.evaluateAll(items => items.map(el => new URL(el.href).pathname));
    for (const slug of ROUTES) {
      assert.ok(targets.includes('/reddit-editor/' + slug + '/'),
        'Missing GitHub Pages quick link: ' + slug);
    }
    await root.close();

    for (const slug of ROUTES) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 820 } });
      try { await visit(page, slug); }
      finally { await page.close(); }
    }

    // Local-only actions, with dummy text and no provider keys/network writes.
    const voice = await browser.newPage();
    try {
      await voice.goto(BASE + 'voice-studio/', { waitUntil: 'domcontentloaded' });
      await voice.locator('#script').fill('Đây là văn bản thử nghiệm không chứa dữ liệu cá nhân.');
      const chars = await voice.locator('#chars').innerText();
      assert.ok(Number(chars) > 0, 'Voice Studio live character count');
      await voice.locator('#clean').click();
      assert.equal(await voice.locator('#script').inputValue(), '', 'Clear text without sending to TTS provider');
      evidence.interactions.push('voice-studio:input-count-clear');
    } finally { await voice.close(); }

    const typesetting = await browser.newPage();
    try {
      await typesetting.goto(BASE + 'typesetting-tools/', { waitUntil: 'domcontentloaded' });
      await typesetting.locator('#script').fill('Phụ đề thử nghiệm một\nPhụ đề thử nghiệm hai');
      await typesetting.locator('#fromText').click();
      const timeline = await typesetting.locator('#list').innerText();
      assert.match(timeline, /Phụ đề thử nghiệm một/);
      assert.match(timeline, /Phụ đề thử nghiệm hai/);
      evidence.interactions.push('typesetting-tools:local-caption-generation');
    } finally { await typesetting.close(); }

    console.log('BROWSER_PREVIEW_OK: 12/12 routes, 12 quick links, 2 local-only interactions');
    console.log('BROWSER_PREVIEW_EVIDENCE', JSON.stringify(evidence));
    return evidence;
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('browser-preview-smoke.mjs')) {
  browserPreviewSmoke().catch(error => {
    console.error('BROWSER_PREVIEW_FAILED', error.stack || String(error));
    process.exitCode = 1;
  });
}

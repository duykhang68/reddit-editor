// Build-only GitHub Pages preview adapter. Never run against Cloudflare production.
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREVIEW_BASE = '/reddit-editor/';
export const PREVIEW_ROUTES = Object.freeze([
  'cashflow-intelligence',
  'ga4-insights',
  'voice-studio',
  'typesetting-tools',
  'youtube-subtitle-writer',
  'wikipedia-writer',
  'rollback-dashboard',
  'vocabulary-insights',
  'starbucks-insights',
  'highlands-insights',
  'payroll-insights',
  'expenses'
]);

// Only navigation URLs for known pages are rewritten. API/auth URLs are
// intentionally unchanged: GitHub Pages cannot serve protected backends.
const routeLiteral = /(["'])\/(cashflow-intelligence|ga4-insights|voice-studio|typesetting-tools|youtube-subtitle-writer|wikipedia-writer|rollback-dashboard|vocabulary-insights|starbucks-insights|highlands-insights|payroll-insights|expenses)(?!\/api(?:\/|[?#"']))(?=\/|[?#"'])/g;
const rootHref = /(\bhref\s*[:=]\s*)(["'])\/\2/g;

export function rewritePreviewNavigation(source) {
  return source
    .replace(routeLiteral, '$1' + PREVIEW_BASE + '$2')
    .replace(rootHref, '$1$2' + PREVIEW_BASE + '$2');
}

export function annotatePreviewHtml(source) {
  if (!/<\/body\s*>/i.test(source) || !/<\/head\s*>/i.test(source)) {
    throw Error('Expected a complete HTML document before injecting preview notice');
  }
  if (source.includes('preview-notice.js')) return source;
  return source
    .replace(/<\/head>/i, '<meta name="robots" content="noindex,nofollow">\n</head>')
    .replace(/<\/body>/i, '<script defer src="' + PREVIEW_BASE + 'preview-notice.js"></script>\n</body>');
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

export async function preparePagesPreview(dist = resolve('apps/web/dist')) {
  if (process.env.GITHUB_PAGES_PREVIEW !== 'true') {
    throw Error('Refusing to change standard build: set GITHUB_PAGES_PREVIEW=true');
  }
  let htmlCount = 0;
  let jsCount = 0;
  for await (const path of walk(dist)) {
    if (!/\.(html|js)$/i.test(path) || path.endsWith('/preview-notice.js')) continue;
    const original = await readFile(path, 'utf8');
    let result = rewritePreviewNavigation(original);
    if (path.endsWith('.html')) {
      result = annotatePreviewHtml(result);
      htmlCount++;
    } else {
      jsCount++;
    }
    if (result !== original) await writeFile(path, result);
  }
  for (const slug of PREVIEW_ROUTES) {
    const path = join(dist, slug, 'index.html');
    await access(path);
    const html = await readFile(path, 'utf8');
    if (!html.includes(PREVIEW_BASE + 'preview-notice.js')) {
      throw Error('Missing preview notice in ' + path);
    }
  }
  const home = await readFile(join(dist, 'index.html'), 'utf8');
  if (!home.includes(PREVIEW_BASE + 'assets/')) {
    throw Error('Vite assets are not built for ' + PREVIEW_BASE);
  }
  await access(join(dist, 'preview-notice.js'));
  await writeFile(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  console.log('GitHub Pages preview validated: 12 routes, ' + htmlCount
    + ' HTML pages, ' + jsCount + ' JS assets. Backend remains disabled.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  preparePagesPreview().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

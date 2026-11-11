/*!
 * Duy Nguyen · Blogger theme enhancements
 * Source of truth: github.com/duykhang68/tetdinhmuiblog
 * Public URL: https://duynguyen-reddit-editor.pages.dev/blogger-assets/theme.js
 *
 * Safe initial release: no DOM styling or content mutation.
 * Add reviewed Blogger-only behaviors below; never include credentials.
 */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.dataset.dnBloggerAssetsReady === '1') return;
  root.dataset.dnBloggerAssetsReady = '1';

  document.dispatchEvent(new CustomEvent('dn-blogger-assets-ready'));
})();

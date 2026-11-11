// This file is included only by the GitHub Pages preview build.
(() => {
  if (!location.pathname.startsWith('/reddit-editor/')) return;
  const notice = document.createElement('aside');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-label', 'GitHub Pages preview');
  notice.textContent = 'PREVIEW GITHUB PAGES · Chỉ kiểm tra giao diện và điều hướng. OAuth, API, dữ liệu và thao tác ghi chưa được chuyển; Cloudflare production không thay đổi.';
  Object.assign(notice.style, {
    background: '#fff4e8',
    borderBottom: '2px solid #ff4500',
    color: '#763914',
    font: '600 13px/1.6 system-ui, sans-serif',
    padding: '12px 18px',
    textAlign: 'center',
    position: 'relative',
    zIndex: '99999'
  });
  document.body.prepend(notice);
})();

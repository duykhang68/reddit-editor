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

  // Public GitHub Pages is an unauthenticated visual preview. In particular,
  // never invite users to enter a GitHub PAT or dispatch rollback from here.
  // This is a UI guard only; server-side authentication is still mandatory.
  if (location.hostname === 'duykhang68.github.io' &&
      location.pathname === '/reddit-editor/rollback-dashboard/') {
    document.querySelectorAll('input,button,select,textarea').forEach(control => {
      if (control instanceof HTMLInputElement && control.type === 'password') control.value = '';
      control.disabled = true;
    });
    const warning = document.createElement('p');
    warning.setAttribute('role', 'note');
    warning.textContent = 'Rollback trên GitHub Pages chỉ để xem giao diện. Không nhập GitHub PAT; mọi nút thao tác đã bị khóa trên bản preview công khai.';
    Object.assign(warning.style, {
      margin: '12px auto',
      maxWidth: '1100px',
      padding: '12px 18px',
      background: '#fff',
      color: '#a33d18',
      border: '1px solid #f0bb9b',
      borderRadius: '10px',
      font: '600 13px/1.6 system-ui, sans-serif'
    });
    notice.insertAdjacentElement('afterend', warning);
  }
})();

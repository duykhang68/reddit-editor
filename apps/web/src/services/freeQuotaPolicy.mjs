// Explicit request-scoped safety guard. This is NOT an account-wide or billing cap.
// The hard account-wide stop must remain enforced by Workers Free / provider settings.
export const MAX_EXTERNAL_CALLS_PER_REQUEST = 4;

export function makeOutboundBudget(max = MAX_EXTERNAL_CALLS_PER_REQUEST) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 50) throw new Error('Invalid outbound budget');
  let used = 0;
  return function charge() {
    if (++used > max) {
      const err = new Error('Đã đạt ngưỡng an toàn gọi API của yêu cầu. Dừng để tránh vượt quota.');
      err.status = 429;
      err.retryAfter = '60';
      throw err;
    }
  };
}

export function googleQuotaError(status, data = {}) {
  const root = data?.error;
  const reasons = [root?.status, root?.message, ...(Array.isArray(root?.errors) ? root.errors.map(x => x?.reason) : [])]
    .filter(Boolean).join(' ').toLowerCase();
  if (status === 429 || (status === 403 && /quota|ratelimit|rate.limit|resource_exhausted|dailylimit|userratelimit/.test(reasons))) {
    const err = new Error('Google API đã giới hạn quota. Yêu cầu đã dừng; không tự retry.');
    err.status = 429;
    err.retryAfter = '3600';
    return err;
  }
  return null;
}

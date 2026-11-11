// Starbucks Rewards Vietnam — policy effective 18 August 2026.
// Source: https://starbucks.vn/ve-chung-toi/cong-ty/chinh-sach-truc-tuyen/starbucks-rewards-terms-and-conditions/
export const POLICY_EFFECTIVE_DATE = '2026-08-18';
export const STORAGE_KEY = 'dn-starbucks-insights-v1';
export const PAYMENT_OPTIONS = [
  { value: 'starbucks-card', label: 'Starbucks Card (100%)' },
  { value: 'cash', label: 'Tiền mặt tại quán' },
  { value: 'wallet', label: 'Ví điện tử / QR' },
  { value: 'pos', label: 'Thẻ ngân hàng / POS' },
  { value: 'mixed', label: 'Thanh toán kết hợp' },
  { value: 'voucher', label: 'Voucher Bundle đã mua' },
  { value: 'third-party', label: 'Ứng dụng đối tác (không tiền mặt)' },
  { value: 'third-party-cash', label: 'Ứng dụng đối tác (tiền mặt)' }
];
const PAYMENT_SET = new Set(PAYMENT_OPTIONS.map(option => option.value));
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const money = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value || 0) + ' ₫';
export const starNumber = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value || 0);

// Tiền thực trả là căn cứ tính chi tiêu và Stars, không cộng phụ thu lần thứ hai.
export function calculatePayable(baseAmount, extraAmount = 0, discountAmount = 0) {
  if (baseAmount === '' || baseAmount === null || baseAmount === undefined) return null;
  return Number(baseAmount) + Number(extraAmount || 0) - Number(discountAmount || 0);
}

export function todayVietnam(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = name => parts.find(part => part.type === name)?.value;
  return value('year') + '-' + value('month') + '-' + value('day');
}

export function validDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function normalizeTransaction(data) {
  const amount = Number(data?.amount);
  const fee = Number(data?.fee || 0);
  const cups = Number(data?.cups);
  const date = String(data?.date || '');
  const payment = String(data?.payment || '');
  const store = String(data?.store || '').trim();
  const item = String(data?.item || '').trim();
  const orderId = String(data?.orderId ?? '').trim();
  const baseAmount = data?.baseAmount === '' || data?.baseAmount == null ? null : Number(data.baseAmount);
  const extraAmount = Number(data?.extraAmount ?? 0);
  const discountAmount = Number(data?.discountAmount ?? 0);
  const extraReason = String(data?.extraReason ?? '').trim();
  const discountReason = String(data?.discountReason ?? '').trim();
  if (!validDate(date)) throw new Error('Ngày giao dịch không hợp lệ.');
  if (!store && !item) throw new Error('Nhập tên món hoặc cửa hàng.');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Số tiền phải là số nguyên dương.');
  if (baseAmount !== null && (!Number.isSafeInteger(baseAmount) || baseAmount <= 0)) throw new Error('Tiền món gốc phải là số nguyên dương.');
  if (!Number.isSafeInteger(extraAmount) || extraAmount < 0) throw new Error('Phụ thu phải là số nguyên không âm.');
  if (!Number.isSafeInteger(discountAmount) || discountAmount < 0) throw new Error('Giảm giá phải là số nguyên không âm.');
  if (baseAmount !== null && calculatePayable(baseAmount, extraAmount, discountAmount) !== amount) {
    throw new Error('Tiền thực trả phải bằng giá món gốc + phụ thu − giảm giá.');
  }
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > amount) throw new Error('Phí không hợp lệ.');
  if (!Number.isSafeInteger(cups) || cups < 0 || cups > 1000) throw new Error('Số ly không hợp lệ.');
  if (!PAYMENT_SET.has(payment)) throw new Error('Phương thức thanh toán không hợp lệ.');
  return {
    id: String(data?.id || ''),
    date,
    store: store.slice(0, 120),
    orderId: orderId.slice(0, 120),
    item: item.slice(0, 120),
    baseAmount,
    extraAmount,
    extraReason: extraReason.slice(0, 200),
    discountAmount,
    discountReason: discountReason.slice(0, 200),
    amount,
    fee,
    cups,
    payment,
    eligible: data?.eligible === true,
    identified: data?.identified === true,
    linked: data?.linked === true,
    excluded: data?.excluded === true
  };
}

export function starsFor(transaction) {
  const tx = normalizeTransaction(transaction);
  if (tx.date < POLICY_EFFECTIVE_DATE || !tx.eligible || tx.excluded) return 0;
  if (tx.payment === 'third-party-cash') return 0;
  if (tx.payment === 'third-party' && !tx.linked) return 0;
  if (!['third-party', 'third-party-cash'].includes(tx.payment) && !tx.identified) return 0;
  const rate = tx.payment === 'starbucks-card' ? 40000 : tx.payment === 'third-party' ? 80000 : 60000;
  // Starbucks allows fractional Stars, and fees charged by delivery partners are excluded.
  return Math.round(((tx.amount - tx.fee) / rate) * 1000000) / 1000000;
}

export function monthKey(date) { return date.slice(0, 7); }
function addMonths(month, offset) {
  const [year, mm] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mm - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}
export function monthlySeries(transactions, { period = '6', now = todayVietnam(), year = '', payment = 'all' } = {}) {
  const current = now.slice(0, 7);
  const relevant = transactions.filter(tx => payment === 'all' || tx.payment === payment);
  let months;
  if (year) {
    months = Array.from({ length: 12 }, (_, i) => year + '-' + String(i + 1).padStart(2, '0'));
  } else {
    const first = relevant.map(tx => monthKey(tx.date)).sort()[0];
    const count = period === 'all'
      ? (first ? Math.max(1, Math.min(240, (Number(current.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(current.slice(5)) - Number(first.slice(5)) + 1)) : 12)
      : Number(period) || 6;
    months = Array.from({ length: count }, (_, i) => addMonths(current, i - count + 1));
  }
  const byMonth = new Map(months.map(key => [key, { key, label: key.slice(5) + '/' + key.slice(2, 4), amount: 0, cups: 0, visits: 0, stars: 0 }]));
  for (const tx of relevant) {
    const row = byMonth.get(monthKey(tx.date));
    if (!row) continue;
    row.amount += tx.amount;
    row.cups += tx.cups;
    row.visits += 1;
    row.stars += starsFor(tx);
  }
  return [...byMonth.values()];
}
export function analytics(transactions, series) {
  const shown = new Set(series.map(row => row.key));
  const filtered = transactions.filter(tx => shown.has(monthKey(tx.date)));
  const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);
  const cups = filtered.reduce((sum, tx) => sum + tx.cups, 0);
  const visits = filtered.length;
  const current = series[series.length - 1]?.amount || 0;
  const previous = series[series.length - 2]?.amount || 0;
  const active = series.filter(row => row.amount > 0);
  return {
    total, cups, visits, averageVisit: visits ? total / visits : 0,
    current, previous, change: previous ? ((current - previous) / previous) * 100 : null,
    averageMonth: series.length ? total / series.length : 0,
    peak: active.reduce((best, row) => !best || row.amount > best.amount ? row : best, null),
    low: active.reduce((best, row) => !best || row.amount < best.amount ? row : best, null)
  };
}
function anniversary(start, yearOffset) {
  const [year, month, day] = start.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year + yearOffset, month, 0)).getUTCDate();
  return String(year + yearOffset).padStart(4, '0') + '-' +
    String(month).padStart(2, '0') + '-' + String(Math.min(day, lastDay)).padStart(2, '0');
}
export function membershipPeriod(start, now = todayVietnam()) {
  if (!validDate(start)) return null;
  if (now < start) return { start, end: anniversary(start, 1), upcoming: true };
  let offset = Number(now.slice(0, 4)) - Number(start.slice(0, 4));
  if (anniversary(start, offset) > now) offset -= 1;
  return { start: anniversary(start, offset), end: anniversary(start, offset + 1), upcoming: false };
}
export function rewardsProgress(transactions, config = {}, now = todayVietnam()) {
  const period = membershipPeriod(config.cycleStart, now);
  const tier = config.tier === 'gold' ? 'gold' : 'green';
  const eligible = transactions.filter(tx => tx.date <= now);
  const membership = eligible.filter(tx => period && tx.date >= period.start && tx.date < period.end)
    .reduce((sum, tx) => sum + starsFor(tx), 0) + Number(config.membershipAdjustment || 0);
  const earnedRewards = eligible.reduce((sum, tx) => sum + starsFor(tx), 0);
  const rewards = Math.max(0, earnedRewards + Number(config.rewardsAdjustment || 0) - Number(config.redeemed || 0));
  const goal = 100;
  const redemptionGoal = tier === 'gold' ? 10 : 20;
  return {
    tier, period, membership: Math.max(0, membership), rewards,
    remaining: Math.max(0, goal - membership),
    membershipPercent: Math.min(100, Math.max(0, membership) / goal * 100),
    redemptionGoal, redemptionRemaining: Math.max(0, redemptionGoal - rewards)
  };
}
export function toCsv(transactions) {
  const columns = ['id', 'date', 'store', 'orderId', 'item', 'baseAmount', 'extraAmount', 'extraReason', 'discountAmount', 'discountReason', 'amount', 'fee', 'cups', 'payment', 'eligible', 'identified', 'linked', 'excluded'];
  const escape = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
  return '\uFEFF' + [columns.join(','), ...transactions.map(tx => columns.map(column => escape(tx[column])).join(','))].join('\r\n');
}

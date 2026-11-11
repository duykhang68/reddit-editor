import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  POLICY_EFFECTIVE_DATE, analytics, calculatePayable, membershipPeriod, monthlySeries, normalizeTransaction,
  rewardsProgress, starsFor, toCsv, todayVietnam, validDate
} from '../src/starbucks-insights/model.js';

const base = {
  id: 'receipt-1', date: '2026-10-15', store: 'Landmark 81',
  item: 'Caffè Latte', amount: 90000, cups: 2, fee: 0,
  payment: 'starbucks-card', eligible: true, identified: true, linked: false, excluded: false
};
const make = overrides => normalizeTransaction({ ...base, ...overrides });

test('Vietnam policy effective date, fractional stars, and 3 payment rates', () => {
  assert.equal(POLICY_EFFECTIVE_DATE, '2026-08-18');
  assert.equal(starsFor(make({ amount: 90000 })), 2.25);
  assert.equal(starsFor(make({ amount: 90000, payment: 'wallet' })), 1.5);
  assert.equal(starsFor(make({ amount: 90000, payment: 'pos' })), 1.5);
  assert.equal(starsFor(make({ amount: 90000, payment: 'voucher' })), 1.5);
  assert.equal(starsFor(make({ amount: 90000, payment: 'third-party', linked: true })), 1.125);
});

test('Stars exclude disqualified, fee, unidentified, pre-policy and third party cash payments', () => {
  assert.equal(starsFor(make({ payment: 'third-party-cash', linked: true })), 0);
  assert.equal(starsFor(make({ payment: 'third-party', linked: false })), 0);
  assert.equal(starsFor(make({ identified: false })), 0);
  assert.equal(starsFor(make({ eligible: false })), 0);
  assert.equal(starsFor(make({ excluded: true })), 0);
  assert.equal(starsFor(make({ date: '2026-08-17' })), 0);
  assert.equal(starsFor(make({ amount: 90000, fee: 10000 })), 2);
  assert.equal(starsFor(make({ date: '2026-08-18' })), 2.25);
});

test('Invalid dates, amounts, cups, payment and fees are rejected', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-02-28'), true);
  assert.throws(() => make({ date: '2026-02-30' }), /Ngày giao dịch/);
  assert.throws(() => make({ amount: -1 }), /Số tiền/);
  assert.throws(() => make({ amount: 30000, fee: 30001 }), /Phí/);
  assert.throws(() => make({ cups: -1 }), /Số ly/);
  assert.throws(() => make({ payment: 'unknown' }), /Phương thức/);
});

test('Monthly grouping works across years, zero fills and separates visits from cups', () => {
  const transactions = [
    make({ id: 'a', date: '2025-12-12', amount: 85000, cups: 2 }),
    make({ id: 'b', date: '2026-02-01', amount: 125000, cups: 1 }),
    make({ id: 'c', date: '2026-02-20', amount: 50000, cups: 3 })
  ];
  const rows = monthlySeries(transactions, { period: '4', now: '2026-03-02' });
  assert.deepEqual(rows.map(row => row.key), ['2025-12', '2026-01', '2026-02', '2026-03']);
  assert.deepEqual(rows.map(row => row.amount), [85000, 0, 175000, 0]);
  const stat = analytics(transactions, rows);
  assert.equal(stat.total, 260000);
  assert.equal(stat.visits, 3);
  assert.equal(stat.cups, 6);
  assert.equal(stat.averageVisit, 260000 / 3);
  assert.equal(stat.peak.key, '2026-02');
  assert.equal(stat.low.key, '2025-12');
  assert.equal(stat.current, 0);
});

test('Year filter and payment filter are scoped independently', () => {
  const transactions = [
    make({ id: 'a', date: '2026-06-03', amount: 50000, payment: 'starbucks-card' }),
    make({ id: 'b', date: '2026-06-04', amount: 40000, payment: 'cash' }),
    make({ id: 'c', date: '2025-06-04', amount: 40000, payment: 'cash' })
  ];
  const rows = monthlySeries(transactions, { year: '2026', payment: 'cash', now: '2026-11-07' });
  assert.equal(rows.length, 12);
  assert.equal(rows[5].amount, 40000);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 40000);
});

test('Membership cycle resets at anniversary and Green/Gold goals stay separate from reward Stars', () => {
  assert.deepEqual(membershipPeriod('2025-08-01', '2026-11-07'), {
    start: '2026-08-01', end: '2027-08-01', upcoming: false
  });
  const transactions = [
    make({ id: 'old', date: '2026-08-28', amount: 80000 }),
    make({ id: 'new', date: '2026-09-30', amount: 80000 })
  ];
  const green = rewardsProgress(transactions, { cycleStart: '2025-09-01', tier: 'green', redeemed: 1 }, '2026-11-07');
  assert.equal(green.membership, 2);
  assert.equal(green.rewards, 3);
  assert.equal(green.remaining, 98);
  assert.equal(green.redemptionGoal, 20);
  const gold = rewardsProgress(transactions, { cycleStart: '2025-09-01', tier: 'gold' }, '2026-11-07');
  assert.equal(gold.redemptionGoal, 10);
});

test('Order ID is optional, preserves leading zeros and survives normalization and CSV export', () => {
  assert.equal(make({}).orderId, '');
  assert.equal(make({ orderId: null }).orderId, '');
  assert.equal(make({ orderId: '  001234  ' }).orderId, '001234');
  assert.equal(make({ orderId: 'SBX-0987' }).orderId, 'SBX-0987');
  assert.equal(make({ orderId: 'X'.repeat(121) }).orderId.length, 120);
  assert.equal(normalizeTransaction(make({ orderId: '000086' })).orderId, '000086');
  assert.equal(starsFor(make({ orderId: 'SBX-0987' })), starsFor(make({})));
  const csv = toCsv([make({ orderId: '000123', item: 'Latte "Size L"' })]);
  assert.match(csv, /^\uFEFFid,date,store,orderId,item,/);
  assert.match(csv, /"000123"/);
  assert.match(csv, /"Latte ""Size L"""/);
});

test('Receipt breakdown reconciles original price, customization surcharge, and discount', () => {
  // Sora Mall: Pure Matcha Latte 80k + Half & Half 5k − ưu đãi 10k = 75k.
  const receipt = make({
    orderId: 'O200147006', date: '2026-11-01', store: 'Sora Mall',
    item: 'Pure Matcha Latte', payment: 'pos', amount: 75000, cups: 1,
    baseAmount: 80000, extraAmount: 5000, extraReason: 'Sữa Half & Half',
    discountAmount: 10000, discountReason: 'Giảm giá ly cá nhân'
  });
  assert.equal(calculatePayable(80000, 5000, 10000), 75000);
  assert.equal(receipt.amount, 75000);
  assert.equal(receipt.baseAmount, 80000);
  assert.equal(receipt.extraReason, 'Sữa Half & Half');
  assert.equal(receipt.discountAmount, 10000);
  assert.equal(receipt.discountReason, 'Giảm giá ly cá nhân');
  assert.equal(starsFor(receipt), 1.25);
  assert.equal(calculatePayable('', 5000, 10000), null);
  const csv = toCsv([receipt]);
  assert.match(csv, /baseAmount,extraAmount,extraReason,discountAmount,discountReason,amount/);
  assert.match(csv, /"Sữa Half & Half"/);
  assert.match(csv, /"Giảm giá ly cá nhân"/);
});

test('Legacy transactions without breakdown still work; inconsistent totals are rejected', () => {
  const legacy = make({ amount: 85000 });
  assert.equal(legacy.baseAmount, null);
  assert.equal(legacy.extraAmount, 0);
  assert.equal(legacy.discountAmount, 0);
  assert.equal(legacy.extraReason, '');
  assert.equal(legacy.discountReason, '');
  assert.equal(starsFor(legacy), 2.125);
  assert.throws(() => make({ amount: 85000, baseAmount: 80000, extraAmount: 5000, discountAmount: 10000 }), /Tiền thực trả/);
  assert.throws(() => make({ extraAmount: -1 }), /Phụ thu/);
  assert.throws(() => make({ discountAmount: -1 }), /Giảm giá/);
  assert.throws(() => make({ baseAmount: -100 }), /Tiền món gốc/);
  assert.throws(() => make({ baseAmount: 0 }), /Tiền món gốc/);
});

test('Receipt breakdown UI contains financial inputs and history columns', () => {
  const component = readFileSync(new URL('../src/starbucks-insights/StarbucksInsights.jsx', import.meta.url), 'utf8');
  for (const field of ['baseAmount', 'extraAmount', 'extraReason', 'discountAmount', 'discountReason']) {
    assert.match(component, new RegExp('value=\\{form\\.' + field + '\\}'));
  }
  assert.match(component, /<th className="sb-num">Phụ thu<\/th>/);
  assert.match(component, /<th className="sb-num">Giảm giá<\/th>/);
  assert.match(component, /calculatePayable\(form\.baseAmount/);
});

test('Order ID input and transaction history column are rendered in the form and table', () => {
  const component = readFileSync(new URL('../src/starbucks-insights/StarbucksInsights.jsx', import.meta.url), 'utf8');
  assert.match(component, /Mã đơn hàng \(không bắt buộc\)/);
  assert.match(component, /value=\{form\.orderId\}/);
  assert.match(component, /<th>Mã đơn hàng<\/th>/);
  assert.match(component, /tx\.orderId \|\| '—'/);
  assert.match(component, /setForm\(initialForm\(\)\)/);
});

test('Independent page and Editor shortcut are wired to Vite multi-page build', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const html = read('../starbucks-insights/index.html');
  const vite = read('../vite.config.js');
  const editor = read('../src/App.jsx');
  const css = read('../src/starbucks-insights/starbucks.css');
  assert.match(html, /Starbucks Rewards/);
  assert.match(html, /\/src\/starbucks-insights\/main\.jsx/);
  assert.match(vite, /starbucksInsights: resolve\(ROOT, 'starbucks-insights\/index.html'\)/);
  assert.match(editor, /href: '\/starbucks-insights\/'/);
  assert.match(editor, /EDITOR_QUICK_LINKS\.length\.toString\(\)\.padStart/);
  assert.match(css, /color-scheme:light/);
  assert.doesNotMatch(css, /slate-900|slate-950|color-scheme:dark/);
});

// HighlandsĐI: chương trình hội viên và chi tiêu (chính sách cập nhật 24/08/2026).
// https://www.highlandscoffee.com.vn/vn/chinh-sach-chuong-trinh-thanh-vien-highlandsdi.html
// Đối với các ngày trước phiên bản chính sách hiện tại, không hồi tố tích DRIPS.
export const POLICY_EFFECTIVE_DATE='2026-08-24';
export const STORAGE_KEY='dn-highlands-insights-v1';
export const PAYMENT_OPTIONS=[
  {value:'pos',label:'Thẻ ngân hàng / POS / Payoo'},
  {value:'cash',label:'Tiền mặt tại quán'},
  {value:'wallet',label:'Ví điện tử / QR'},
  {value:'highlands-card',label:'Thẻ Highlands'},
  {value:'app',label:'Ứng dụng HighlandsĐI'},
  {value:'other',label:'Phương thức khác'}
];
const PAYMENT_SET=new Set(PAYMENT_OPTIONS.map(x=>x.value));
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
  const itemsCount = Number(data?.itemsCount);
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
  if (!Number.isSafeInteger(itemsCount) || itemsCount < 0 || itemsCount > 1000) throw new Error('Số món không hợp lệ.');
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
    itemsCount,
    payment,
    eligible: data?.eligible === true,
    identified: data?.identified === true,
    excluded: data?.excluded === true
  };
}


// DRIPS chỉ là ước tính, không tự tuyên bố đã cộng vào tài khoản thật.
// Giấy in POS không chứng minh người mua đã quét tài khoản HighlandsĐI.
export function dripsFor(transaction) {
  const tx=normalizeTransaction(transaction);
  if(tx.date<POLICY_EFFECTIVE_DATE||!tx.eligible||!tx.identified||tx.excluded)return 0;
  return Math.floor(Math.max(0,tx.amount-tx.fee)/10000);
}
const qualifiesForHighlandsDI=tx=>tx.date>=POLICY_EFFECTIVE_DATE&&tx.eligible&&tx.identified&&!tx.excluded;
export function stampsFor(transaction) {
  const tx=normalizeTransaction(transaction);
  return qualifiesForHighlandsDI(tx)&&tx.amount-tx.fee>=50000?1:0;
}
export function potentialDripsFor(transaction) {
  const tx=normalizeTransaction(transaction);
  return tx.excluded||!tx.eligible||tx.date<POLICY_EFFECTIVE_DATE?0:
    Math.floor(Math.max(0,tx.amount-tx.fee)/10000);
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
  const byMonth = new Map(months.map(key => [key, { key, label: key.slice(5) + '/' + key.slice(2, 4), amount: 0, itemsCount: 0, visits: 0, drips: 0 }]));
  for (const tx of relevant) {
    const row = byMonth.get(monthKey(tx.date));
    if (!row) continue;
    row.amount += tx.amount;
    row.itemsCount += tx.itemsCount;
    row.visits += 1;
    row.drips += dripsFor(tx);
  }
  return [...byMonth.values()];
}
export function analytics(transactions, series) {
  const shown = new Set(series.map(row => row.key));
  const filtered = transactions.filter(tx => shown.has(monthKey(tx.date)));
  const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);
  const itemsCount = filtered.reduce((sum, tx) => sum + tx.itemsCount, 0);
  const visits = filtered.length;
  const current = series[series.length - 1]?.amount || 0;
  const previous = series[series.length - 2]?.amount || 0;
  const active = series.filter(row => row.amount > 0);
  return {
    total, itemsCount, visits, averageVisit: visits ? total / visits : 0,
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

export function rewardsProgress(transactions,config={},now=todayVietnam()){
  const period=membershipPeriod(config.cycleStart,now);
  const eligible=transactions.filter(tx=>tx.date<=now);
  const within=eligible.filter(tx=>period&&tx.date>=period.start&&tx.date<period.end);
  // Chi tiêu xét hạng vẫn gồm giao dịch dưới 10.000đ: chỉ DRIPS mới làm tròn xuống.
  const membership=Math.max(0,within.reduce((sum,tx)=>sum+(qualifiesForHighlandsDI(tx)?Math.max(0,tx.amount-tx.fee):0),0)
    +Number(config.membershipAdjustment||0));
  const tier=membership>=10000000?'black':membership>=3000000?'platinum':'gold';
  const goal=tier==='gold'?3000000:10000000;
  const rewards=Math.max(0,eligible.reduce((sum,tx)=>sum+dripsFor(tx),0)+
    Number(config.rewardsAdjustment||0)-Number(config.redeemed||0));
  const stamps=Math.max(0,eligible.reduce((sum,tx)=>sum+stampsFor(tx),0)-
    Number(config.stampsRedeemed||0));
  return {
    tier,reportedTier:['gold','platinum','black'].includes(config.tier)?config.tier:'gold',
    period,membership,rewards,stamps,
    goal,remaining:Math.max(0,goal-membership),
    membershipPercent:Math.min(100,membership/goal*100),
    redemptionGoal:9,redemptionRemaining:9-stamps%9,
    couponsEarned:Math.floor(stamps/9)
  };
}
export function toCsv(transactions){
  const columns=['id','date','store','orderId','item','baseAmount','extraAmount','extraReason','discountAmount','discountReason','amount','fee','itemsCount','payment','eligible','identified','excluded'];
  const escape=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  return '\uFEFF'+[columns.join(','),...transactions.map(tx=>columns.map(key=>escape(tx[key])).join(','))].join('\r\n');
}

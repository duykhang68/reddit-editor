import { calculatePayable, validDate } from './model.js';

// Bộ trích xuất có chủ đích: không đoán giá trị không xuất hiện trên hóa đơn.
// Thuần JS để chạy độc lập với OCR engine, tiện kiểm thử và cải thiện nhận dạng.
const ascii = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();

const moneyAtEnd = line => {
  const text = String(line || '');
  const match = text.match(/[-−]?\s*[₫đ]?\s*(\d{1,3}(?:[.,\s]\d{3})+|\d{1,8})(?:\s*(?:[₫đ]|vnd))?\s*$/iu);
  if (!match) return null;
  const value = Number(match[1].replace(/\D/g, ''));
  if (!Number.isSafeInteger(value) || (value < 1000 && !/[₫đ]/iu.test(match[0]))) return null;
  return value;
};

const removeMoneyAtEnd = line => String(line).replace(/[-−]?\s*(?:[₫đ]|[dD](?=\d))?\s*(?:\d{1,3}(?:[.,\s]\d{3})+|\d{1,8})(?:\s*(?:[₫đ]|vnd))?\s*$/iu, '').trim();
const labels = {
  order: /(?:ma don hang|order id|check no|check number)/,
  date: /(?:ngay\s*&?\s*gio|ngay giao dich|date\s*(?:&|and)?\s*time)/,
  subtotal: /(?:tam tinh|subtotal)/,
  discount: /(?:giam gia|discount|uu dai)/,
  total: /(?:tong don hang|tong thanh toan|total order|total amount|grand total)/,
  count: /(?:tong so mon|total items)/,
  shop: /(?:giao dich tai cua hang|in.store transaction|transaction at store)/,
  option: /(?:lua chon|tuy chinh|sua\s*:|half\s*&\s*half|topping|extra shot|add.on|phu thu|nang size)/,
  shipping: /(?:phi giao hang|delivery fee|shipping fee)/
};
const findIndex = (lines, pattern, start = 0) =>
  lines.findIndex((line, index) => index >= start && pattern.test(ascii(line)));
const readLabeledAmount = (lines, pattern) => {
  const index = findIndex(lines, pattern);
  if (index < 0) return null;
  return moneyAtEnd(lines[index]) ?? moneyAtEnd(lines[index + 1]);
};
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

// Ký tự nhiễu từ icon, bullet, vùng chọn của ứng dụng thường nằm ở mép tên.
// Chỉ làm sạch đầu/cuối, tuyệt đối giữ dấu gạch nối ở giữa tên (Cold Brew - Vanilla),
// dấu ngoặc tên size và phần trăm thực (ví dụ "100%").
export function cleanReceiptName(value) {
  const edge = /[\s_\-‐‑‒–—−~·•|¦:;,.!?›>→]+$/u;
  return clean(value)
    .replace(/^[\s_\-‐‑‒–—−~·•|¦:;,.!?›>→]+/u, '')
    .replace(edge, '')
    .replace(/(?:\s+%+|([^\d\s])%+)$/u, (_full, letter) => letter || '')
    .replace(edge, '')
    .trim();
}

function parseOrderId(lines) {
  const index = findIndex(lines, labels.order);
  if (index < 0) return '';
  for (const row of [lines[index], lines[index + 1]]) {
    const matches = String(row || '').match(/\b[A-Z0-9][A-Z0-9-]{5,29}\b/gi) || [];
    const candidate = matches.find(value => /\d/.test(value) && !/^20\d{2}[-/]\d/.test(value));
    if (candidate) return candidate;
  }
  return '';
}
function parseDate(lines) {
  const target = lines.map(clean).join(' ');
  const match = target.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return { date: '', time: '' };
  const date = match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0');
  if (!validDate(date)) return { date: '', time: '' };
  const time = match[4] !== undefined && Number(match[4]) <= 23 && Number(match[5]) <= 59
    ? match[4].padStart(2, '0') + ':' + match[5] : '';
  return { date, time };
}
function parseStore(lines) {
  const index = findIndex(lines, labels.shop);
  if (index < 0) return '';
  const row = cleanReceiptName(lines[index + 1] || '');
  if (!row || /(?:vi tri|dia chi|address|ngay|ma don)/.test(ascii(row))) return '';
  return row.slice(0, 120);
}
const isSummary = line => [
  labels.count, labels.subtotal, labels.discount, labels.total,
  /(?:phuong thuc thanh toan|payment method|visa|mastercard|the thanh toan)/
].some(pattern => pattern.test(ascii(line)));

function parseItemsAndExtras(lines) {
  const shop = findIndex(lines, labels.shop);
  const count = findIndex(lines, labels.count);
  const subtotal = findIndex(lines, labels.subtotal);
  const limit = [count, subtotal].filter(index => index >= 0).sort((a, b) => a - b)[0] ?? lines.length;
  const start = shop >= 0 ? shop + 2 : 0;
  const items = [], extras = [], optionDetails = [];
  for (let index = start; index < limit; index += 1) {
    const line = lines[index];
    const key = ascii(line);
    if (isSummary(line) || /(?:^vi tri|^dia chi|^location|^so luong|^qty|^x\s*\d+$)/.test(key)) continue;
    const amount = moneyAtEnd(line);
    let description = cleanReceiptName(removeMoneyAtEnd(line));
    if (!description && index > start) description = cleanReceiptName(lines[index - 1]);
    const name = ascii(description);
    if (!name || /(?:vi tri|dia chi|address|ma don|ngay|starbucks rewards|personal cup|ly ca nhan|^x\s*\d+$)/.test(name)) continue;
    // Giữ lại dòng diễn giải tùy chỉnh, kể cả OCR không nhận ra giá ở cuối dòng.
    // Bao gồm mức ngọt, sữa, topping, size... chứ không chỉ các khoản có giá.
    if (labels.option.test(name) || /^(?:do ngot|sweetness|ice level|muc da|size\s*:)/.test(name)) {
      const option = cleanReceiptName(description.replace(/^(?:Lựa chọn|Lua chon)\s*/i, ''));
      if (option && !optionDetails.includes(option)) optionDetails.push(option);
      if (amount !== null && amount > 0) extras.push({ name: option, amount });
      continue;
    }
    if (amount === null) continue;
    if (amount > 0 && /[a-zA-ZÀ-ỹ]/u.test(description)) {
      const nextLine = ascii(lines[index + 1] || '');
      const quantityMatch = nextLine.match(/^x\s*(\d{1,2})$/);
      const quantity = quantityMatch ? Math.max(1, Math.min(20, Number(quantityMatch[1]))) : 1;
      items.push({ name: description, amount, quantity });
    }
  }
  return { items, extras, optionDetails };
}
function parsePayment(lines) {
  const text = ascii(lines.join(' '));
  const section = findIndex(lines, /(?:phuong thuc thanh toan|payment method)/);
  const payment = section >= 0 ? ascii(lines.slice(section).join(' ')) : text;
  if (/\bstarbucks card\b/.test(payment)) return 'starbucks-card';
  if (/(?:\bvisa\b|\bmastercard\b|\bjcb\b|\bnapas\b|\bpos\b)/.test(payment)) return 'pos';
  if (/(?:\bmomo\b|\bzalopay\b|\bshopeepay\b|vi dien tu)/.test(payment)) return 'wallet';
  if (/(?:tien mat|\bcash\b)/.test(payment)) return 'cash';
  return '';
}
function parseDiscountReason(lines) {
  const index = findIndex(lines, labels.discount);
  if (index < 0) return '';
  // Chỉ chép nội dung thực có trên hóa đơn; không tự suy ra ưu đãi từ Personal Cup.
  const original = cleanReceiptName(removeMoneyAtEnd(lines[index]));
  const reason = cleanReceiptName(original.replace(/^(?:giảm giá|giam gia|discount|ưu đãi|uu dai)\s*[:：\-]?\s*/i, ''));
  if (reason && ascii(reason) !== ascii(original)) return reason.slice(0, 200);
  // Trường hợp OCR xuống dòng: "Giảm giá" -> "Voucher thành viên" -> "-10.000".
  const next = cleanReceiptName(removeMoneyAtEnd(lines[index + 1] || ''));
  const normalized = ascii(next);
  if (next && /[a-zA-ZÀ-ỹ]/u.test(next) &&
    ![labels.subtotal, labels.total, labels.count, labels.shipping, labels.order, labels.date, labels.shop].some(pattern => pattern.test(normalized)) &&
    !/(?:phuong thuc thanh toan|payment method|visa|mastercard|starbucks card)/.test(normalized)) {
    return next.slice(0, 200);
  }
  return '';
}

export function parseStarbucksReceipt(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean);
  const warnings = [], fields = {};
  const dateInfo = parseDate(lines);
  if (dateInfo.date) fields.date = dateInfo.date;
  const orderId = parseOrderId(lines);
  if (orderId) fields.orderId = orderId;
  const store = parseStore(lines);
  if (store) fields.store = store;
  const { items, extras, optionDetails } = parseItemsAndExtras(lines);
  if (items.length) {
    fields.item = items.map(row => row.name).join(' · ').slice(0, 120);
    const drink = items.filter(row => /(?:latte|matcha|coffee|ca phe|tra |tea|frappuccino|espresso|americano|mocha|macchiato|cappuccino|cold brew)/.test(ascii(row.name)));
    if (drink.length) fields.cups = String(drink.reduce((sum, row) => sum + row.quantity, 0));
    fields.baseAmount = String(items.reduce((sum, row) => sum + row.amount * row.quantity, 0));
  }
  if (extras.length) fields.extraAmount = String(extras.reduce((sum, row) => sum + row.amount, 0));
  // Diễn giải phải được autofill dù OCR chưa đọc được con số phụ thu.
  if (optionDetails.length) fields.extraReason = optionDetails.join(' · ').slice(0, 200);
  const subtotal = readLabeledAmount(lines, labels.subtotal);
  let discount = readLabeledAmount(lines, labels.discount);
  // OCR đôi lúc tách "Giảm giá", "Voucher sinh nhật", "-10.000" thành ba dòng.
  // Chỉ lấy dòng thứ ba nếu đó là số tiền độc lập, không lấy nhầm tổng đơn hay thẻ.
  if (discount === null) {
    const discountLine = findIndex(lines, labels.discount);
    const possibleAmount = lines[discountLine + 2] || '';
    if (discountLine >= 0 && !ascii(removeMoneyAtEnd(possibleAmount)) &&
      moneyAtEnd(possibleAmount) !== null) discount = moneyAtEnd(possibleAmount);
  }
  const total = readLabeledAmount(lines, labels.total);
  if (discount !== null) fields.discountAmount = String(discount);
  const discountReason = parseDiscountReason(lines);
  if (discountReason) fields.discountReason = discountReason;
  const shipping = readLabeledAmount(lines, labels.shipping);
  if (shipping !== null) fields.fee = String(shipping);
  const payment = parsePayment(lines);
  if (payment) fields.payment = payment;
  if (total !== null) fields.amount = String(total);
  else if (subtotal !== null && discount !== null && subtotal > discount) {
    fields.amount = String(subtotal - discount);
    warnings.push('Không đọc thấy tổng đơn hàng; thực trả đang được suy ra từ tạm tính và giảm giá.');
  }
  // Không dùng số tiền giao dịch từ thẻ (VISA) thay cho tổng đơn hàng khi thiếu nhãn.
  if (subtotal !== null && total !== null && discount !== null && subtotal - discount !== total) {
    warnings.push('Tạm tính, giảm giá và tổng đơn hàng không khớp; cần đối chiếu hóa đơn.');
  }
  // Khi OCR bỏ qua giá phụ thu, đừng xóa giá món gốc đã nhận ra.
  // Đối soát chỉ được phép suy ra phần chênh lệch nếu tổng tiền tạo thành một phép tính nhất quán.
  // Việc suy ra phải được cảnh báo để người dùng kiểm tra trên ảnh trước khi lưu.
  const confirmedSubtotal = subtotal !== null && total !== null &&
    subtotal - (discount ?? 0) === total;
  const canReconcile = shipping === null || shipping === 0;
  const beforeDiscount = confirmedSubtotal ? subtotal
    : subtotal === null && total !== null && discount !== null ? total + discount
      : null;
  if (canReconcile && beforeDiscount !== null && Number.isSafeInteger(beforeDiscount) && beforeDiscount > 0) {
    const recognizedBase = Number(fields.baseAmount || 0);
    const recognizedExtra = Number(fields.extraAmount || 0);
    if (recognizedBase > 0 && recognizedBase + recognizedExtra < beforeDiscount) {
      const missingExtra = beforeDiscount - recognizedBase - recognizedExtra;
      fields.extraAmount = String(recognizedExtra + missingExtra);
      warnings.push('OCR có thể đã bỏ sót phụ thu/món thêm ' + missingExtra.toLocaleString('vi-VN') +
        'đ; đã điền số chênh lệch theo ' + (confirmedSubtotal ? 'Tạm tính' : 'Tổng đơn + giảm giá') +
        '. Hãy kiểm tra trên ảnh trước khi lưu.');
    } else if (!recognizedBase && recognizedExtra > 0 && beforeDiscount > recognizedExtra) {
      fields.baseAmount = String(beforeDiscount - recognizedExtra);
      warnings.push('Chưa nhận diện rõ giá món gốc; đã suy ra từ tổng trước giảm trừ phụ thu. Hãy đối chiếu bằng ảnh.');
    }
  }

  if (fields.baseAmount && fields.amount) {
    const calculated = calculatePayable(fields.baseAmount, fields.extraAmount || 0, fields.discountAmount || 0);
    if (calculated !== Number(fields.amount)) {
      // Chỉ tự điền giá gốc khi các món đã đọc đủ; nếu lệch, giữ giá trị từ hóa đơn để người dùng sửa.
      warnings.push('Chi tiết giá món/phụ thu không khớp thực trả; kiểm tra lại các ô trước khi lưu.');
    }
  }
  if (!fields.amount) warnings.push('Chưa đọc được tổng thực trả; vui lòng kiểm tra và nhập bằng tay.');
  if (!fields.orderId) warnings.push('Chưa nhận được mã đơn hàng.');
  if (!fields.store) warnings.push('Chưa nhận được tên cửa hàng.');
  if (!fields.item) warnings.push('Chưa nhận được tên món.');
  return { fields, warnings, lines, time: dateInfo.time, subtotal, items, extras };
}

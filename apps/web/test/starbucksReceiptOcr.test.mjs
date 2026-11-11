import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { cleanReceiptName, parseStarbucksReceipt } from '../src/starbucks-insights/receiptOcr.js';

const sora = [
  'STARBUCKS REWARDS',
  'Mã đơn hàng O200147006',
  'Ngày & Giờ 01/11/2026 11:34',
  'Điểm Ngôi Sao đã tích lũy 1',
  'Điểm Ngôi Sao thưởng 0',
  'Giao dịch tại cửa hàng',
  'Sora Mall',
  'Vị trí 102, Tầng 1, Lô C19',
  'Pure Matcha Latte ₫80,000',
  'Lựa chọn Sữa: Sữa Half & Half ₫5,000',
  'Độ ngọt: Không ngọt',
  'x1',
  'Personal Cup ₫0',
  'x1',
  'Tổng số món 2',
  'Tạm tính ₫85,000',
  'Giảm giá -₫10,000',
  'Tổng đơn hàng ₫75,000',
  'PHƯƠNG THỨC THANH TOÁN',
  'VISA(437841******8921) ₫75,000'
].join('\n');

test('Starbucks Rewards screenshot fills transaction without double-counting extras', () => {
  const result = parseStarbucksReceipt(sora);
  assert.equal(result.fields.orderId, 'O200147006');
  assert.equal(result.fields.date, '2026-11-01');
  assert.equal(result.time, '11:34');
  assert.equal(result.fields.store, 'Sora Mall');
  assert.equal(result.fields.item, 'Pure Matcha Latte');
  assert.equal(result.fields.baseAmount, '80000');
  assert.equal(result.fields.extraAmount, '5000');
  assert.match(result.fields.extraReason, /Half & Half/);
  assert.equal(result.fields.discountAmount, '10000');
  assert.equal(result.fields.discountReason, undefined); // Lý do giảm không có trên ảnh.
  assert.equal(result.fields.amount, '75000');
  assert.equal(result.fields.cups, '1'); // Personal Cup không phải đồ uống thứ hai.
  assert.equal(result.fields.payment, 'pos');
  assert.equal(result.warnings.length, 0);
});

test('OCR removes icon artifacts around store and item names from the uploaded Starbucks screenshot', () => {
  const noisyText = sora
    .replace('Sora Mall', 'Sora Mall %')
    .replace('Pure Matcha Latte ₫80,000', '-_ Pure Matcha Latte ₫80,000');
  const result = parseStarbucksReceipt(noisyText);
  assert.equal(result.fields.store, 'Sora Mall');
  assert.equal(result.fields.item, 'Pure Matcha Latte');
  assert.equal(result.fields.baseAmount, '80000');
  assert.equal(result.fields.extraAmount, '5000');
  assert.equal(result.fields.discountAmount, '10000');
  assert.equal(result.fields.amount, '75000');
  assert.equal(result.fields.orderId, 'O200147006');
  assert.equal(result.warnings.length, 0);
});

test('OCR name cleanup preserves legitimate internal punctuation, sizes and percentages', () => {
  assert.equal(cleanReceiptName('Sora Mall %'), 'Sora Mall');
  assert.equal(cleanReceiptName('Sora Mall%'), 'Sora Mall');
  assert.equal(cleanReceiptName('  › -_ Pure Matcha Latte -_  '), 'Pure Matcha Latte');
  assert.equal(cleanReceiptName('Cold Brew - Vanilla'), 'Cold Brew - Vanilla');
  assert.equal(cleanReceiptName('Caffè Latte (L)'), 'Caffè Latte (L)');
  assert.equal(cleanReceiptName('Original 100%'), 'Original 100%');
  assert.equal(cleanReceiptName('Starbucks Reserve'), 'Starbucks Reserve');
  const text = sora.replace('Sora Mall', '› Sora Mall% >')
    .replace('Pure Matcha Latte ₫80,000', '• Pure Matcha Latte -_ ₫80,000');
  const receipt = parseStarbucksReceipt(text);
  assert.equal(receipt.fields.store, 'Sora Mall');
  assert.equal(receipt.fields.item, 'Pure Matcha Latte');
});

test('OCR supports accentless labels, price on next line, and unknown discount reason', () => {
  const result = parseStarbucksReceipt([
    'Ma don hang', '0123456789',
    'Ngay & Gio 07/11/2026 08:09',
    'Giao dich tai cua hang', 'Landmark 81',
    'Caffe Latte', 'd80,000',
    'Lua chon sua: Sữa Half & Half', 'd5,000',
    'Tam tinh', 'd85,000',
    'Giam gia', '-d10,000',
    'Tong don hang', 'd75,000',
    'VISA'
  ].join('\n'));
  assert.equal(result.fields.orderId, '0123456789');
  assert.equal(result.fields.date, '2026-11-07');
  assert.equal(result.fields.baseAmount, '80000');
  assert.equal(result.fields.extraAmount, '5000');
  assert.equal(result.fields.discountAmount, '10000');
  assert.equal(result.fields.amount, '75000');
  assert.equal(result.fields.store, 'Landmark 81');
  assert.equal(result.fields.discountReason, undefined);
});

test('Inconsistent or partial OCR warns instead of inventing payment totals', () => {
  const result = parseStarbucksReceipt([
    'Mã đơn hàng O123456789',
    'Ngày & Giờ 01/11/2026 11:34',
    'Giao dịch tại cửa hàng',
    'Sora Mall',
    'Matcha Latte ₫80,000',
    'Tạm tính ₫80,000',
    'Giảm giá -₫10,000',
    'Tổng đơn hàng ₫75,000',
    'VISA(123456789) ₫75,000'
  ].join('\n'));
  assert.equal(result.fields.amount, '75000');
  assert.ok(result.warnings.some(text => /không khớp/i.test(text)));
  const missing = parseStarbucksReceipt('VISA(123456******7890) ₫75,000\nSTARBUCKS REWARDS');
  assert.equal(missing.fields.amount, undefined);
  assert.ok(missing.warnings.some(text => /Chưa đọc được tổng thực trả/.test(text)));
});

test('OCR recovers missing 5,000 surcharge without clearing original 80,000 price', () => {
  const missingSurcharge = sora.replace('Lựa chọn Sữa: Sữa Half & Half ₫5,000', 'Lựa chọn Sữa: Sữa Half & Half');
  const result = parseStarbucksReceipt(missingSurcharge);
  assert.equal(result.fields.baseAmount, '80000');
  assert.equal(result.fields.extraAmount, '5000');
  assert.equal(result.fields.discountAmount, '10000');
  assert.equal(result.fields.amount, '75000');
  assert.equal(result.subtotal, 85000);
  assert.ok(result.warnings.some(message => /bỏ sót phụ thu\/món thêm 5\.000đ/.test(message)));
});

test('OCR can reconcile a missing surcharge when subtotal text is unreadable', () => {
  const noSubtotal = sora.replace('Lựa chọn Sữa: Sữa Half & Half ₫5,000', 'Lựa chọn Sữa: Sữa Half & Half')
    .replace('Tạm tính ₫85,000\n', '');
  const result = parseStarbucksReceipt(noSubtotal);
  assert.equal(result.fields.baseAmount, '80000');
  assert.equal(result.fields.extraAmount, '5000');
  assert.equal(result.fields.amount, '75000');
  assert.ok(result.warnings.some(message => /Tổng đơn \+ giảm giá/.test(message)));
});

test('OCR keeps an uncertain original amount visible but never invents a surcharge on inconsistent totals', () => {
  const conflicting = sora.replace('Lựa chọn Sữa: Sữa Half & Half ₫5,000', 'Lựa chọn Sữa: Sữa Half & Half')
    .replace('Tạm tính ₫85,000', 'Tạm tính ₫82,000');
  const result = parseStarbucksReceipt(conflicting);
  assert.equal(result.fields.baseAmount, '80000');
  assert.equal(result.fields.extraAmount, undefined);
  assert.equal(result.fields.amount, '75000');
  assert.ok(result.warnings.some(message => /không khớp/i.test(message)));
});

test('OCR uses the recognized surcharge and never adds it twice', () => {
  const result = parseStarbucksReceipt(sora);
  assert.equal(result.fields.baseAmount, '80000');
  assert.equal(result.fields.extraAmount, '5000');
  assert.equal(result.warnings.length, 0);
});

test('Form import no longer deletes a read original price when the OCR breakdown differs', () => {
  const component = readFileSync(new URL('../src/starbucks-insights/StarbucksInsights.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(component, /delete mapped\.baseAmount/);
  assert.match(component, /Giá món gốc \+ phụ thu/);
});

test('OCR autofills customization descriptions even if the surcharge price is unreadable', () => {
  const missingPrice = sora.replace('Lựa chọn Sữa: Sữa Half & Half ₫5,000', 'Lựa chọn Sữa: Sữa Half & Half');
  const result = parseStarbucksReceipt(missingPrice);
  assert.equal(result.fields.baseAmount, '80000');
  assert.equal(result.fields.extraAmount, '5000');
  assert.match(result.fields.extraReason, /Sữa: Sữa Half & Half/);
  assert.match(result.fields.extraReason, /Độ ngọt: Không ngọt/);
});

test('OCR fills a discount reason only if receipt explicitly describes it', () => {
  const explicit = parseStarbucksReceipt(sora.replace('Giảm giá -₫10,000', 'Giảm giá: Voucher thành viên -₫10,000'));
  assert.equal(explicit.fields.discountAmount, '10000');
  assert.equal(explicit.fields.discountReason, 'Voucher thành viên');
  assert.equal(explicit.fields.amount, '75000');
  const noReason = parseStarbucksReceipt(sora);
  assert.equal(noReason.fields.discountReason, undefined);
});

test('OCR reads multiline discount descriptions and amounts', () => {
  const multiline = parseStarbucksReceipt(sora.replace('Giảm giá -₫10,000', 'Giảm giá\nVoucher sinh nhật\n-₫10,000'));
  assert.equal(multiline.fields.discountReason, 'Voucher sinh nhật');
  assert.equal(multiline.fields.discountAmount, '10000');
  assert.equal(multiline.fields.amount, '75000');
});

test('Receipt breakdown stays prominent and editable in Reddit light mode', () => {
  const component = readFileSync(new URL('../src/starbucks-insights/StarbucksInsights.jsx', import.meta.url), 'utf8');
  const stylesheet = readFileSync(new URL('../src/starbucks-insights/starbucks.css', import.meta.url), 'utf8');
  assert.match(component, /sb-finance-equation/);
  assert.match(component, /sb-finance-before/);
  assert.match(component, /sb-finance-discount/);
  assert.match(component, /sb-finance-payable/);
  assert.match(component, /value=\{form\.extraReason\}/);
  assert.match(component, /value=\{form\.discountReason\}/);
  assert.match(stylesheet, /\.sb-finance-equation\{display:grid/);
  assert.match(stylesheet, /@media\(max-width:740px\)\{\.sb-finance-equation/);
});

test('Reconciliation palette uses Reddit light neutrals with a green payable state', () => {
  const stylesheet = readFileSync(new URL('../src/starbucks-insights/starbucks.css', import.meta.url), 'utf8');
  assert.match(stylesheet, /\.sb-finance-summary\{[^}]*background:#fff;[^}]*border:1px solid #e3e6e8/);
  assert.match(stylesheet, /\.sb-finance-before\{[^}]*background:#fff/);
  assert.match(stylesheet, /\.sb-finance-discount\{[^}]*background:#fff9f8/);
  assert.match(stylesheet, /\.sb-finance-discount strong\{color:#b42318\}/);
  assert.match(stylesheet, /\.sb-finance-payable\{[^}]*background:#eaf6ef;[^}]*border-color:#c8e7d4/);
  assert.match(stylesheet, /\.sb-finance-payable strong\{color:#006b43\}/);
  assert.doesNotMatch(stylesheet, /\.sb-finance-payable\{[^}]*#ffede5/);
  assert.doesNotMatch(stylesheet, /\.sb-finance-summary\{[^}]*#ffd6c5/);
});

test('Upload remains opt-in, browser-only and does not save an OCR result', () => {
  const component = readFileSync(new URL('../src/starbucks-insights/StarbucksInsights.jsx', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/starbucks-insights/receiptOcrBrowser.js', import.meta.url), 'utf8');
  assert.match(component, /parseStarbucksReceipt\(recognized\.text\)/);
  assert.match(component, /setForm\(\{ \.\.\.initialForm\(\), \.\.\.mapped \}\)/);
  assert.match(component, /onChange=\{importReceiptImage\}/);
  assert.match(component, /Chọn ảnh hóa đơn/);
  assert.match(component, /Chỉ lưu khi bạn bấm Thêm giao dịch/);
  assert.match(worker, /worker\.recognize\(file\)/);
  assert.doesNotMatch(worker, /fetch\(file|FormData|XMLHttpRequest|upload\.php/i);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHighlandsReceipt,mergeHighlandsReceiptCandidates} from '../src/highlands-insights/receiptOcr.js';
import {STORAGE_KEY,calculatePayable,normalizeTransaction,dripsFor,stampsFor,
  potentialDripsFor,rewardsProgress,monthlySeries,analytics,toCsv} from '../src/highlands-insights/model.js';
import {DRIVE_SYNC_KEY} from '../src/highlands-insights/driveSync.js';

const bauBang=[
 'HIGHLANDS COFFEE',
 'KCN Bau Bang, Duong NC -D13-5A, Tru Van',
 'Tho, TP.HCM',
 'SDT: 027.4730.1511',
 'ShopID: 30799',
 'Hoa Don Thanh Toan',
 'In Store                     Pager: 11',
 'Check: 139154',
 'Ngay: 03-11-2026 17:45             POS01',
 'Thu ngan: Thu Ngan Sang 1',
 '-----------------------------------',
 '1     Banh Tiramisu               39.000',
 '1     Nuoc Tinh Khiet Dasani       15.000',
 '      510ml',
 '-----------------------------------',
 'Thanh tien:                        54.000',
 'Tong tien:                         54.000',
 'Payoo Bank Card                    54.000',
 'Xuat hoa don: Quet QR'
].join('\n');

const make=(fields={})=>normalizeTransaction({
 id:'t1',date:'2026-11-03',store:'KCN Bau Bang',item:'Bánh Tiramisu · Nước Dasani',
 orderId:'139154',baseAmount:54000,extraAmount:0,discountAmount:0,amount:54000,
 fee:0,itemsCount:2,payment:'pos',eligible:true,identified:false,excluded:false,...fields
});

test('Highlands thermal POS receipt parses 2 line items without double counting totals and Payoo',()=>{
 const data=parseHighlandsReceipt(bauBang);
 assert.equal(data.fields.date,'2026-11-03');
 assert.equal(data.time,'17:45');
 assert.equal(data.fields.orderId,'139154');
 assert.equal(data.fields.store,'KCN Bau Bang');
 assert.equal(data.fields.payment,'pos');
 assert.equal(data.fields.itemsCount,'2');
 assert.equal(data.fields.baseAmount,'54000');
 assert.equal(data.fields.amount,'54000');
 assert.equal(data.items.length,2);
 assert.match(data.fields.item,/Banh Tiramisu/);
 assert.match(data.fields.item,/Dasani 510ml/);
 assert.ok(data.warnings.some(w=>/không xác nhận đã tích DRIPS/.test(w)));
});
test('Receipt parser rejects unrelated brands and never interprets QR or telephone as products',()=>{
 const other=parseHighlandsReceipt('STARBUCKS REWARDS\nCheck: 123456\nTong tien: 54000');
 assert.deepEqual(other.fields,{});
 const data=parseHighlandsReceipt(bauBang);
 assert.equal(data.items.length,2);
 assert.equal(data.subtotal,54000);
});
test('Thermal OCR keeps POS fields when the HIGH LANDS logo is corrupted or absent',()=>{
  const corrupted=bauBang
    .replace('HIGHLANDS COFFEE','HICHLANOS C0FFEE')
    .replace('Thanh tien:','Thanh tién:')
    .replace('Tong tien:','Tổng tiền:');
  const parsed=parseHighlandsReceipt(corrupted);
  assert.equal(parsed.fields.date,'2026-11-03');
  assert.equal(parsed.fields.store,'KCN Bau Bang');
  assert.equal(parsed.fields.orderId,'139154');
  assert.equal(parsed.fields.baseAmount,'54000');
  assert.equal(parsed.fields.amount,'54000');
  assert.equal(parsed.fields.payment,'pos');
  assert.equal(parsed.items.length,2);
  assert.equal(parsed.recognizedBrand,false);
  assert.ok(parsed.warnings.some(message=>/Logo Highlands đọc chưa rõ/.test(message)));
});

test('Highlands receipt accepts spaced logo; unrelated receipts still rejected',()=>{
  const spaced=parseHighlandsReceipt(bauBang.replace('HIGHLANDS COFFEE','H I G H L A N D S  C O F F E E'));
  assert.equal(spaced.recognizedBrand,true);
  assert.equal(spaced.fields.amount,'54000');
  const unrelated=parseHighlandsReceipt('STARBUCKS REWARDS\nShopID: 9999\nCheck: 123456\nTong tien: 54000\nPayoo Bank Card');
  assert.deepEqual(unrelated.fields,{});
});

test('Thermal OCR supports price on next line and three-line printed items',()=>{
  const broken=bauBang.replace('1     Banh Tiramisu               39.000','1 Banh Tiramisu\n39.000')
    .replace('1     Nuoc Tinh Khiet Dasani       15.000','1\nNuoc Tinh Khiet Dasani\n15.000');
  const parsed=parseHighlandsReceipt(broken);
  assert.equal(parsed.items.length,2);
  assert.equal(parsed.fields.itemsCount,'2');
  assert.equal(parsed.fields.baseAmount,'54000');
  assert.match(parsed.fields.item,/Dasani 510ml/);
  assert.equal(parsed.fields.amount,'54000');
});

test('Thermal OCR can preserve trustworthy totals when item lines are damaged',()=>{
  const withoutItems=bauBang.replace('1     Banh Tiramisu               39.000','Banh Tiramisu')
    .replace('1     Nuoc Tinh Khiet Dasani       15.000','Nuoc Tinh Khiet Dasani');
  const parsed=parseHighlandsReceipt(withoutItems);
  assert.equal(parsed.items.length,0);
  assert.equal(parsed.fields.baseAmount,'54000');
  assert.equal(parsed.fields.amount,'54000');
  assert.equal(parsed.fields.payment,'pos');
  assert.equal(parsed.fields.itemsCount,undefined);
  assert.ok(parsed.warnings.some(w=>/giá gốc tạm lấy từ Thành tiền/.test(w)));
});

test('Browser re-runs OCR when text omits amount, item or date even at high confidence',async()=>{
  const {shouldRetryReceiptOcr}=await import('../src/highlands-insights/receiptOcrBrowser.js');
  assert.equal(shouldRetryReceiptOcr({text:'HIGHLANDS COFFEE\nCheck:139154',confidence:99}),true);
  assert.equal(shouldRetryReceiptOcr({text:bauBang,confidence:70}),false);
  const component=readFileSync(new URL('../src/highlands-insights/HighlandsInsights.jsx',import.meta.url),'utf8');
  assert.match(component,/setReceiptResult\(\{\.\.\.result,confidence:recognized.confidence,mappedCount:0\}\)/);
  assert.doesNotMatch(component,/throw new Error\('Không tìm thấy dữ liệu hóa đơn Highlands trong ảnh này/);
});

test('Real sample photo OCR artifacts still recover Check, date and 54,000 VND Payoo amount',()=>{
 const noisy=[
   '= HAAS COFFE —',
   'KCN B -p13+ van >',
   'ShopID: 30799 :',
   'SS Hoa Don Thanh Toan Se',
   'In Store Pager 1 * —',
   'Check: 139154 > —',
   'Noay : 03-11-2026 17:45 posot — :',
   'SSS anh Tiramisu 39. Se SS',
   '1 Nuoc Tinh Khiet Dasani 15.000 SSS S<—S',
   'Tong tien: 400) SS',
   'Payoo Bank Card 54,000 —= .',
   'Xuat hoa don: Quet OR va nhap thong tin'
 ].join('\n');
 const receipt=parseHighlandsReceipt(noisy);
 assert.equal(receipt.recognizedBrand,false);
 assert.equal(receipt.fields.date,'2026-11-03');
 assert.equal(receipt.fields.orderId,'139154');
 assert.equal(receipt.fields.payment,'pos');
 assert.equal(receipt.fields.amount,'54000');
 assert.equal(receipt.fields.baseAmount,'54000');
 assert.ok(receipt.warnings.some(w=>/Payoo/.test(w)));
 assert.ok(receipt.warnings.some(w=>/Chưa đọc đủ giá từng món/.test(w)));
});

test('ShopID 30799 corrects a damaged KCN Bau Bang store address without changing money',()=>{
 const corrupted=bauBang.replace('HIGHLANDS COFFEE','HAAS COFFE')
   .replace('KCN Bau Bang, Duong NC -D13-5A, Tru Van','KCN B -p13+ van >');
 const receipt=parseHighlandsReceipt(corrupted);
 assert.equal(receipt.shopId,'30799');
 assert.equal(receipt.storeSource,'verified-shop-id');
 assert.equal(receipt.fields.store,'KCN Bau Bang');
 assert.equal(receipt.fields.orderId,'139154');
 assert.equal(receipt.fields.date,'2026-11-03');
 assert.equal(receipt.time,'17:45');
 assert.equal(receipt.fields.payment,'pos');
 assert.equal(receipt.fields.amount,'54000');
 assert.ok(receipt.warnings.some(w=>/chuẩn hóa từ ShopID 30799/.test(w)));
});

test('Unknown ShopID must not hallucinate KCN Bau Bang',()=>{
 const other=bauBang.replace('ShopID: 30799','ShopID: 55555')
   .replace('KCN Bau Bang, Duong NC -D13-5A, Tru Van','KCN B -p13+ van >');
 const receipt=parseHighlandsReceipt(other);
 assert.equal(receipt.shopId,'55555');
 assert.equal(receipt.fields.store,'KCN B -p13+ van >');
 assert.equal(receipt.storeSource,'ocr');
});

test('OCR candidate fusion obtains store from header and financial totals from receipt body',()=>{
 const noisy=[
   'HAAS COFFE',
   'KCN B -p13+ van >',
   'Check: 139154',
   'Ngay: 03-11-2026 17:45 POS01',
   'Payoo Bank Card 54,000 —= .'
 ].join('\n');
 const focused=[
   'HIGHLANDS COFFEE',
   'KCN Bau Bang, Duong NC -D13-5A, Tru Van',
   'ShopID: 30799',
   'Check: 139154',
 ].join('\n');
 const merged=mergeHighlandsReceiptCandidates([
   {label:'Ảnh gốc',text:noisy,confidence:80},
   {label:'Tiêu đề & ShopID',text:focused,confidence:65}
 ]);
 assert.equal(merged.fields.store,'KCN Bau Bang');
 assert.equal(merged.shopId,'30799');
 assert.equal(merged.fields.amount,'54000');
 assert.equal(merged.fields.orderId,'139154');
 assert.equal(merged.fields.date,'2026-11-03');
 assert.equal(merged.time,'17:45');
 assert.equal(merged.fields.payment,'pos');
 assert.equal(merged.ocrVariants.length,2);
 assert.match(merged.ocrVariants[1].text,/KCN Bau Bang/);
});

test('Header-only OCR can contribute ShopID despite failing standalone POS classifier',()=>{
 const payment=[
  'HAAS COFFE','KCN B -p13+ van >','Check: 139154',
  'Ngay: 03-11-2026 17:45 POS01','Payoo Bank Card 54,000 —= .'
 ].join('\n');
 const header=['HAAS COFFE','KCN Bau Bang','ShopID: 30799'].join('\n');
 assert.equal(Object.keys(parseHighlandsReceipt(header).fields).length,0);
 const merged=mergeHighlandsReceiptCandidates([
  {label:'Ảnh gốc',text:payment,confidence:73},
  {label:'Tiêu đề & ShopID',text:header,confidence:90}
 ]);
 assert.equal(merged.shopId,'30799');
 assert.equal(merged.fields.store,'KCN Bau Bang');
 assert.equal(merged.fields.orderId,'139154');
 assert.equal(merged.fields.amount,'54000');
});

test('OCR candidate fusion leaves a visible warning if recognized ShopIDs disagree',()=>{
 const original=bauBang;
 const competing=bauBang.replace('ShopID: 30799','ShopID: 55555')
   .replace('KCN Bau Bang, Duong NC -D13-5A, Tru Van','KCN Unknown');
 const merged=mergeHighlandsReceiptCandidates([
   {label:'Ảnh gốc',text:original,confidence:77},
   {label:'Tiêu đề',text:competing,confidence:78}
 ]);
 assert.ok(merged.warnings.some(message=>/ShopID khác nhau/.test(message)));
});

test('Live OCR workflow keeps alternative passes, header crop, and manual correction of store',()=>{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
 const browser=read('../src/highlands-insights/receiptOcrBrowser.js');
 const component=read('../src/highlands-insights/HighlandsInsights.jsx');
 assert.match(browser,/alternatives\.push/);
 assert.match(browser,/enhanceImage\(image,'header'\)/);
 assert.match(browser,/tessedit_pageseg_mode:'6'/);
 assert.match(component,/mergeHighlandsReceiptCandidates\(recognized\.alternatives\)/);
 assert.match(component,/Xem từng lượt OCR/);
 assert.match(component,/onChange=\{e => updateForm\('store', e\.target\.value\)\}/);
});

test('DRIPS floor to 10,000 and TemDI only with verified member and >=50k',()=>{
 assert.equal(STORAGE_KEY,'dn-highlands-insights-v1');
 assert.equal(DRIVE_SYNC_KEY,'dn-highlands-drive-sync-v1');
 assert.equal(dripsFor(make()),0);
 assert.equal(potentialDripsFor(make()),5);
 assert.equal(stampsFor(make()),0);
 assert.equal(dripsFor(make({identified:true})),5);
 assert.equal(stampsFor(make({identified:true})),1);
 assert.equal(dripsFor(make({identified:true,amount:29000,baseAmount:29000})),2);
 assert.equal(stampsFor(make({identified:true,amount:29000,baseAmount:29000})),0);
 assert.equal(dripsFor(make({identified:true,excluded:true})),0);
 assert.equal(dripsFor(make({identified:true,date:'2026-08-23'})),0);
});
test('Membership thresholds use monetary spend, not number of DRIPS',()=>{
 const config={cycleStart:'2026-01-01',tier:'gold',membershipAdjustment:0,rewardsAdjustment:0,redeemed:0,stampsRedeemed:0};
 const tx=make({identified:true});
 let progress=rewardsProgress([tx],config,'2026-11-07');
 assert.equal(progress.tier,'gold');assert.equal(progress.membership,54000);
 assert.equal(progress.rewards,5);assert.equal(progress.stamps,1);
 progress=rewardsProgress([make({identified:true,amount:3000000,baseAmount:3000000})],config,'2026-11-07');
 assert.equal(progress.tier,'platinum');
 progress=rewardsProgress([make({identified:true,amount:10000000,baseAmount:10000000})],config,'2026-11-07');
 assert.equal(progress.tier,'black');
});
test('Eligible sub-10k purchase adds tier spending without fractional DRIPS',()=>{
 const tx=make({identified:true,amount:9000,baseAmount:9000});
 assert.equal(dripsFor(tx),0);
 assert.equal(stampsFor(tx),0);
 const result=rewardsProgress([tx],{cycleStart:'2026-01-01',tier:'gold'},'2026-11-07');
 assert.equal(result.membership,9000);
 assert.equal(result.rewards,0);
});

test('Multi-month analytics, payment filtering and CSV preserve independent Highlands details',()=>{
 const tx=[make({id:'a'}),make({id:'b',date:'2026-10-03',amount:39000,baseAmount:39000,itemsCount:1})];
 const series=monthlySeries(tx,{period:'3',now:'2026-11-07'});
 assert.deepEqual(series.map(row=>row.amount),[0,39000,54000]);
 assert.equal(analytics(tx,series).total,93000);
 assert.match(toCsv(tx),/itemsCount/);
 assert.match(toCsv(tx),/139154/);
 assert.equal(calculatePayable(39000,15000,0),54000);
});
test('Independent Highlands page, route, style, quick link and separate Drive data',()=>{
 const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
 const html=read('../highlands-insights/index.html');
 const entry=read('../src/highlands-insights/HighlandsInsights.jsx');
 const vite=read('../vite.config.js');
 const quick=read('../src/App.jsx');
 const css=read('../src/highlands-insights/highlands.css');
 const google=read('../src/services/googleDriveService.js');
 assert.match(html,/Highlands Rewards/);
 assert.match(html,/\/src\/highlands-insights\/main.jsx/);
 assert.match(vite,/highlandsInsights: resolve\(ROOT, 'highlands-insights\/index.html'\)/);
 assert.match(quick,/href: '\/highlands-insights\/'/);
 assert.match(css,/color-scheme:light/);
 assert.match(entry,/parseHighlandsReceipt\(recognized.text\)/);
 assert.match(entry,/useHighlandsDriveSync/);
 assert.match(google,/dn_highlands/);
 assert.match(google,/readHighlandsState/);
 assert.match(google,/saveHighlandsSnapshot/);
 assert.doesNotMatch(entry,/delete mapped\.baseAmount/);
});

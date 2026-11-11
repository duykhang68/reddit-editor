import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {
  CATEGORIES,allCategories,amountValue,daysInMonth,emptyData,insightTips,monthBefore,
  newCategory,normalizeData,normalizeTransaction,spendingMetrics,toCsv,validDate
} from '../src/expenses/model.js';

const make=(id,day,amount,categoryId='food')=>({id,date:'2026-11-'+day,amount,categoryId,note:'Chi tiêu '+id});

test('Default categories cover the six requested personal expense buckets',()=>{
  assert.deepEqual(CATEGORIES.map(c=>c.label),[
    'Ăn uống','Cà phê','Di chuyển','Hóa đơn & Tiện ích','Mua sắm & Đồ dùng','Giải trí & Khác'
  ]);
  assert.equal(new Set(CATEGORIES.map(c=>c.id)).size,6);
});

test('Custom category persists through normalized backup and works across months',()=>{
  const custom=newCategory('Nuôi thú cưng',CATEGORIES);
  const raw={...emptyData(),customCategories:[custom],transactions:[
    {id:'a',date:'2026-11-01',categoryId:custom.id,amount:100000,note:'Đồ ăn'},
    {id:'b',date:'2026-12-01',categoryId:custom.id,amount:130000,note:'Tiêm phòng'}
  ],budgets:{
    '2026-11':{total:3000000,categories:{[custom.id]:200000}},
    '2026-12':{total:3200000,categories:{[custom.id]:250000}}
  }};
  const restored=normalizeData(JSON.parse(JSON.stringify(raw)));
  assert.equal(restored.customCategories[0].label,'Nuôi thú cưng');
  assert.equal(allCategories(restored).length,7);
  assert.equal(spendingMetrics(restored,'2026-11','2026-11-07').top.id,custom.id);
  assert.equal(spendingMetrics(restored,'2026-12','2026-11-07').spent,130000);
  assert.equal(spendingMetrics(restored,'2026-12','2026-11-07').limit,3200000);
  assert.throws(()=>newCategory('nuôi thú cưng',allCategories(restored)),/đã tồn tại/);
  assert.throws(()=>newCategory(' ',CATEGORIES),/2 đến 48/);
});

test('Budget warnings kick in at 80%, and exceed at 100%; zero is not unset',()=>{
  const data={...emptyData(),transactions:[make('a','01',1200000,'coffee')],budgets:{
    '2026-11':{total:2000000,categories:{coffee:1500000,food:0}}
  }};
  const metrics=spendingMetrics(data,'2026-11','2026-11-07');
  assert.equal(metrics.spent,1200000);
  assert.equal(metrics.warnings.length,1);
  assert.equal(metrics.warnings[0].label,'Cà phê');
  assert.equal(metrics.warnings[0].percent,80);
  assert.equal(metrics.remaining,800000);
  assert.equal(metrics.forecast,1200000/7*30);
  data.transactions.push(make('b','02',300000,'coffee'));
  const next=spendingMetrics(data,'2026-11','2026-11-07');
  assert.equal(next.warnings[0].percent,100);
  assert.equal(next.remaining,500000);
  assert.ok(insightTips(next).some(t=>t.includes('chạm hạn mức')));
});

test('Current-month forecast uses elapsed calendar days, not number of transaction dates',()=>{
  const data={...emptyData(),transactions:[make('a','01',700000),make('b','01',300000)]};
  const current=spendingMetrics(data,'2026-11','2026-11-07');
  assert.equal(current.elapsed,7);
  assert.equal(current.average,1000000/7);
  assert.equal(current.forecast,1000000/7*30);
  assert.equal(current.daysLeft,23);
  assert.equal(spendingMetrics(data,'2026-11','2026-12-01').forecast,null);
  assert.equal(spendingMetrics(data,'2026-11','2026-10-25').forecast,null);
});

test('Outlier requires sufficient history and uses real daily totals',()=>{
  const data={...emptyData(),transactions:[
    make('1','01',20000),make('2','02',25000),make('3','03',30000),make('4','04',500000)
  ]};
  const metrics=spendingMetrics(data,'2026-11','2026-11-07');
  assert.deepEqual(metrics.anomalies.map(row=>row.date),['2026-11-04']);
  data.transactions=data.transactions.slice(0,3);
  assert.equal(spendingMetrics(data,'2026-11','2026-11-07').anomalies.length,0);
});

test('Monthly separation, leap dates and invalid transaction amounts/categories are enforced',()=>{
  assert.equal(daysInMonth('2024-02'),29);
  assert.equal(daysInMonth('2026-02'),28);
  assert.equal(validDate('2026-02-29'),false);
  assert.equal(validDate('2024-02-29'),true);
  assert.equal(monthBefore('2026-01'),'2025-12');
  assert.throws(()=>normalizeTransaction({...make('a','01',0)}),/lớn hơn 0/);
  assert.throws(()=>normalizeTransaction({...make('a','01',300),categoryId:'unknown'}),/không tồn tại/);
  assert.throws(()=>normalizeTransaction({...make('a','01',300),date:'2026-11-31'}),/không hợp lệ/);
  assert.throws(()=>amountValue(-100),/không âm/);
});

test('Import rejects duplicate transaction ids and arbitrary category keys',()=>{
  assert.throws(()=>normalizeData({...emptyData(),transactions:[make('a','01',1000),make('a','02',2000)]}),/trùng ID/);
  assert.throws(()=>normalizeData({...emptyData(),budgets:{'2026-11':{total:10000,categories:{unknown:1000}}}}),/danh mục lạ/);
  assert.throws(()=>normalizeData({...emptyData(),customCategories:[{id:'x',label:'Sức khỏe'}]}),/Mã danh mục/);
});

test('CSV export uses real transactions and escapes quotes',()=>{
  const csv=toCsv([make('a','01',125000,'coffee')],[...CATEGORIES]);
  assert.match(csv,/^\uFEFF"id","date","category","amount_vnd","note"/);
  assert.match(csv,/"Cà phê","125000"/);
});

test('Standalone Vite route, editor shortcut and light design are included',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  assert.match(read('../vite.config.js'),/expenses: resolve\(ROOT, 'expenses\/index.html'\)/);
  assert.match(read('../expenses/index.html'),/\/src\/expenses\/main\.jsx/);
  assert.match(read('../src/App.jsx'),/href: '\/expenses\/'/);
  assert.match(read('../src/editor-kit.css'),/kit-quick-link-expenses/);
  const css=read('../src/expenses/expenses.css');
  assert.match(css,/color-scheme:light/);
  assert.match(css,/#173e33/);
  assert.doesNotMatch(css,/color-scheme:dark|slate-950/);
});

test('Reddit OrangeRed light-theme layer loads after base styles and uses accessible CTAs',()=>{
  const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
  const entry=read('../src/expenses/main.jsx');
  assert.match(entry,/import '\.\/expenses\.css';\s*import '\.\/reddit-light\.css';/);
  const theme=read('../src/expenses/reddit-light.css');
  assert.match(theme,/--ex-orange:\s*#ff4500/);
  assert.match(theme,/--ex-bg:\s*#f6f7f8/);
  assert.match(theme,/--ex-orange-cta:\s*#d63e05/);
  assert.match(theme,/\.ex-summary-main\s*\{\s*color:#1a1a1b;\s*background:linear-gradient/);
  assert.match(theme,/\.ex-chart-bar\.is-peak\{background:var\(--ex-orange\)\}/);
  assert.match(theme,/\.ex-meter-warning>span\{background:#ecae42\}/);
  assert.match(theme,/\.ex-meter-exceeded>span\{background:#dc4f50\}/);
  assert.doesNotMatch(theme,/color-scheme:\s*dark|background:\s*#173e33/);
  assert.match(read('../src/editor-kit.css'),/\.kit-layout \.kit-quick-link-expenses\{--quick-accent:#ff4500\}/);
});

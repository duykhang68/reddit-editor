import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readVnd,extractLine,extractLedger,classify,inferFormulas,summarizeRows,taxableTax} from '../src/payroll-insights/model.js';
import {LAWS,minimumWage,knowledgeFor} from '../src/payroll-insights/laws.js';
import {buildWorkbookBytes} from '../src/payroll-insights/xlsxExport.js';
import {layoutTextItems} from '../src/payroll-insights/pdfClient.js';

const sample=[
 'Lương cơ bản 20.000.000',
 'Phụ cấp ăn trưa 2.000.000',
 'Tổng thu nhập 22.000.000',
 'Lương đóng BHXH 20.000.000',
 'BHXH 1.600.000',
 'BHYT 300.000',
 'BHTN 200.000',
 'Thu nhập tính thuế 1.000.000',
 'Thuế TNCN 50.000',
 'Tổng khấu trừ 2.150.000',
 'Thực nhận 19.850.000'
];
const rows=extractLedger(sample.map(text=>({text,page:1})));

test('Read VND numbers but never infer currency from dates, identity or ratios',()=>{
 assert.equal(readVnd('20.000.000'),20000000);
 assert.equal(readVnd('20,000,000'),20000000);
 assert.equal(readVnd('20000000'),20000000);
 assert.equal(readVnd('1.230,50'),null);
 assert.equal(readVnd('9%'),null);
 assert.equal(extractLine('Mã nhân viên 00023456789',1).amount,null);
 assert.equal(extractLine('Tháng 11/2026',1).amount,null);
 assert.equal(extractLine('Lương 12.350.000',1).amount,12350000);
});
test('Classification covers gross, net, insurance, allowances, overtime and payroll tax',()=>{
 assert.equal(classify('Thực nhận 20.000.000'),'net');
 assert.equal(classify('Phụ cấp ăn trưa 500.000'),'allowance');
 assert.equal(classify('Tăng ca ngày thường 300.000'),'overtime');
 assert.equal(classify('Tổng khấu trừ'),'deductionTotal');
 assert.equal(classify('Thuế TNCN'),'pit');
 assert.equal(classify('Lương đóng BHXH'),'insuranceBase');
});
test('Only exact reconciled amounts receive Excel formulas',()=>{
 const inferred=inferFormulas(rows);
 const find=category=>inferred.find(row=>row.category===category);
 assert.equal(find('gross').status,'Khớp phép tính');
 assert.match(find('gross').formula,/^SUM\(D/);
 assert.equal(find('social').formula.includes('*0.08'),true);
 assert.equal(find('health').formula.includes('*0.015'),true);
 assert.equal(find('unemployment').formula.includes('*0.01'),true);
 assert.equal(find('pit').status,'Khớp phép tính');
 assert.equal(find('net').status,'Khớp phép tính');
 assert.equal(find('net').expected,19850000);
 const tampered=rows.map(r=>r.category==='net'?{...r,amount:19000000}:r);
 assert.equal(inferFormulas(tampered).find(r=>r.category==='net').formula,'');
 assert.equal(summarizeRows(tampered).net,19000000);
});
test('Five-step 2026 PIT calculation uses progressive monthly bands',()=>{
 assert.equal(taxableTax(10000000),500000);
 assert.equal(taxableTax(20000000),1500000);
 assert.equal(taxableTax(30000000),2500000);
 assert.equal(taxableTax(60000000),8500000);
 assert.equal(taxableTax(100000000),20500000);
});
test('Minimum wage law effective date is not applied backward',()=>{
 assert.equal(minimumWage('2026-11','I').minimum,5310000);
 assert.equal(minimumWage('2026-11','IV').minimum,3700000);
 assert.equal(minimumWage('2027-01','I').minimum,5700000);
 assert.equal(minimumWage('2025-09','I'),null);
 assert.equal(minimumWage('2026-11',''),null);
 const knowledge=knowledgeFor(rows,{period:'2026-11',region:'I',dependents:1});
 assert.ok(knowledge.items.some(i=>i.id==='pit'&&/15\.500\.000/.test(i.detail)));
 assert.ok(knowledge.items.some(i=>i.id==='minimum'&&i.law.id==='NĐ 293/2025/NĐ-CP'));
 assert.equal(LAWS.min2027.from,'2027-01-01');
});
test('PDF text line layout groups same-baseline cells and keeps page numbers',()=>{
 const items=[
  {str:'Tổng thu nhập',transform:[1,0,0,1,20,100],width:95},
  {str:'22.000.000',transform:[1,0,0,1,365,101],width:65},
  {str:'Thực nhận',transform:[1,0,0,1,20,76],width:80},
  {str:'19.850.000',transform:[1,0,0,1,360,76],width:72}
 ];
 const result=layoutTextItems(items,3);
 assert.equal(result.length,2);
 assert.match(result[0].text,/Tổng thu nhập 22\.000\.000/);
 assert.equal(result[0].page,3);
 assert.match(result[1].text,/19\.850\.000/);
});
function storedZipEntries(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const decode=new TextDecoder(),result={};let cursor=0;
 while(cursor+30<=bytes.length&&view.getUint32(cursor,true)===0x04034b50){
  const nameLen=view.getUint16(cursor+26,true),extra=view.getUint16(cursor+28,true);
  const size=view.getUint32(cursor+18,true);
  const start=cursor+30+nameLen+extra,name=decode.decode(bytes.slice(cursor+30,cursor+30+nameLen));
  result[name]=decode.decode(bytes.slice(start,start+size));cursor=start+size;
 }
 return result;
}
test('Export produces a real XLSX OOXML ZIP with source, verified formulas and legal citations',()=>{
 const bytes=buildWorkbookBytes(rows,{filename:'Bang luong 11-2026.pdf',period:'2026-11',region:'I'});
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 const entries=storedZipEntries(bytes);
 for(const file of ['[Content_Types].xml','xl/workbook.xml','xl/styles.xml',
 'xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml','xl/worksheets/sheet3.xml','xl/worksheets/sheet4.xml'])
  assert.ok(entries[file],file+' missing');
 assert.match(entries['xl/workbook.xml'],/fullCalcOnLoad="1"/);
 assert.match(entries['xl/worksheets/sheet1.xml'],/<f>SUM\(D7,D8\)<\/f>/);
 assert.match(entries['xl/worksheets/sheet1.xml'],/Khớp phép tính/);
 assert.match(entries['xl/worksheets/sheet3.xml'],/293\/2025\/NĐ-CP/);
 assert.match(entries['xl/worksheets/sheet3.xml'],/vanban\.chinhphu\.vn/);
});
test('Payroll app has independent route, quick access and no automatic salary upload',()=>{
 const get=path=>readFileSync(new URL(path,import.meta.url),'utf8');
 const html=get('../payroll-insights/index.html'),ui=get('../src/payroll-insights/main.jsx');
 const vite=get('../vite.config.js'),quick=get('../src/App.jsx'),css=get('../src/payroll-insights/payroll.css');
 assert.match(html,/Payroll &amp; C&amp;B Insights/);
 assert.match(vite,/payrollInsights: resolve\(ROOT, 'payroll-insights\/index.html'\)/);
 assert.match(quick,/href: '\/payroll-insights\/'/);
 assert.match(ui,/type="application\/pdf"/);
 assert.match(ui,/downloadWorkbook\(/);
 assert.match(ui,/knowledgeFor\(/);
 assert.match(ui,/Xóa dữ liệu khỏi phiên xem/);
 assert.match(css,/color-scheme:light/);
 assert.doesNotMatch(ui,/localStorage\.setItem/);
});

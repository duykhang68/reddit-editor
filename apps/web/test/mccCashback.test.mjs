import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMccValues,filterMcc,distinct} from '../src/mcc-cashback/model.mjs';
const head=['MCC','Ngành hàng','Ngân hàng','Sản phẩm / hạng thẻ','Visa / Mastercard','Nhóm chi tiêu','Cashback rate','Điều kiện hưởng','Trần hoàn','Trạng thái / thời hạn','Hình thức','Nguồn chính thức (URL)','Ngày tra cứu','Ghi chú','Kiểm duyệt'];
const values=[head,['5411','Siêu thị','HSBC','Platinum Cash Back','Visa','Siêu thị','8%','Nhận lương','200000','Còn hạn','Hoàn tiền','https://www.hsbc.com.vn/a','2026-11-20','','IMPORTED_UNVERIFIED'],['8211','Giáo dục','VPBank','Lady','Mastercard','Học tập','15%','Điều kiện','50000','20/11/2026','Hoàn tiền','https://www.vpbank.com.vn/a','2026-11-20','','EXPIRED_REVIEW']];
test('parses the explicit schema and keeps bank/card/source',()=>{
 const r=parseMccValues(values);assert.equal(r.length,2);assert.equal(r[0].mcc,'5411');assert.equal(r[1].network,'Mastercard');assert.equal(distinct(r,'bank').length,2);
});
test('MCC search and Visa/Mastercard filtering',()=>{
 const r=parseMccValues(values);assert.equal(filterMcc(r,{query:'sieu thi',network:'Visa'}).length,1);
 assert.equal(filterMcc(r,{bank:'VPBank',current:true}).length,0);
});
test('rejects missing bank/MCC schema and non-four-digit codes',()=>{
 assert.throws(()=>parseMccValues([['MCC']]),/Thiếu cột/);
 assert.equal(parseMccValues([head,['54111','Other']]).length,0);
});

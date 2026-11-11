import {summarizeRows,formatVnd,taxableTax} from './model.js';

// Sources verified 2026-11-07; maintain effective dates rather than "current" labels.
export const LAWS={
 labor:{id:'BLLĐ 45/2019/QH14',title:'Bộ luật Lao động 2019 · Điều 90, 94, 95, 96, 97, 98, 104',
  url:'https://vanban.chinhphu.vn/?docid=198540&lang=vi&pageid=27160',
  from:'2021-01-01',note:'Trả lương, bảng kê, làm thêm giờ, thưởng theo điều kiện thực tế.'},
 insurance:{id:'Luật BHXH 41/2024/QH15',title:'Luật Bảo hiểm xã hội 2024, có hiệu lực 01/07/2025',
  url:'https://vanban.chinhphu.vn/?classid=1&docid=211199&orggroupid=1&pageid=27160',
  from:'2025-07-01',note:'Tỷ lệ phần NLĐ tham khảo: BHXH 8%, BHYT 1,5%, BHTN 1%; căn cứ đóng/trần tùy đối tượng.'},
 insuranceRate:{id:'BHXH Việt Nam',title:'Giải thích mức đóng BHXH/BHYT/BHTN của người lao động',
  url:'https://baohiemxahoi.gov.vn/tintuc/Pages/ky-niem-25-nam-thanh-lap-bhxh-viet-nam.aspx?CateID=0&ItemID=24900',
  from:'2025-07-01',note:'Mức NLĐ phổ biến 10,5% với lao động Việt Nam; không mặc định áp dụng cho mọi trường hợp.'},
 tax:{id:'Luật TNCN 109/2025/QH15',title:'Thuế thu nhập cá nhân 2025 · Điều 8–10',
  url:'https://vanban.chinhphu.vn/?classid=1&docid=216495&pageid=27160&typegroupid=1',
  from:'2026-01-01',note:'Đối với lương, tiền công cá nhân cư trú: kỳ tính thuế 2026, biểu 5 bậc và giảm trừ gia cảnh.'},
 taxDecree:{id:'NĐ 253/2026/NĐ-CP',title:'Hướng dẫn thi hành Luật Thuế TNCN',
  url:'https://vanban.chinhphu.vn/?docid=218684&pageid=27160&typegroupid=4',
  from:'2026-07-01',note:'Nghị định hướng dẫn, cần đối chiếu thời điểm trả thu nhập và đối tượng.'},
 min2026:{id:'NĐ 293/2025/NĐ-CP',title:'Lương tối thiểu vùng từ 01/01/2026',
  url:'https://vanban.chinhphu.vn/?classid=1&docid=215832&pageid=27160',
  from:'2026-01-01',to:'2026-12-31',note:'Vùng I 5,31 triệu; II 4,73 triệu; III 4,14 triệu; IV 3,70 triệu/tháng.'},
 min2027:{id:'NĐ 399/2026/NĐ-CP',title:'Lương tối thiểu vùng từ 01/01/2027',
  url:'https://vanban.chinhphu.vn/?docid=220166&pageid=27160&typegroupid=4',
  from:'2027-01-01',note:'Vùng I 5,70 triệu; II 5,08 triệu; III 4,45 triệu; IV 4,04 triệu/tháng; KHÔNG áp dụng hồi tố năm 2026.'}
};
export const WAGE_REGIONS=['I','II','III','IV'];
export function minimumWage(period,region){
 const year=Number(String(period||'').slice(0,4));
 const index=WAGE_REGIONS.indexOf(region);
 if(index===-1||!Number.isFinite(year)||year<2026||year>2027)return null;
 const numbers=year===2026?[5310000,4730000,4140000,3700000]:[5700000,5080000,4450000,4040000];
 return {minimum:numbers[index],law:year===2026?LAWS.min2026:LAWS.min2027};
}
export function knowledgeFor(rows,{period='2026-11',region='',dependents=0}={}){
 const summary=summarizeRows(rows),cats=new Set(rows.map(r=>r.category)),find=type=>rows.find(r=>r.category===type&&r.amount!==null);
 const items=[];
 const add=(id,title,detail,law,status='Tham chiếu',confidence='Cần đối chiếu hồ sơ')=>
  items.push({id,title,detail,law,status,confidence});
 add('statement','Thông tin trả lương và bảng kê',
  'Điều 95 Bộ luật Lao động: cần cung cấp bảng kê trả lương; nội dung cần đối chiếu gồm khoản lương, làm thêm, khấu trừ và bảo hiểm (nếu có). Bản PDF hiện có không tự chứng minh việc trả lương đúng hạn.',
  LAWS.labor,cats.has('gross')||cats.has('net')?'Có dữ liệu đối chiếu':'Chưa thấy dòng tổng rõ');
 if(cats.has('overtime'))add('overtime','Làm thêm giờ/OT',
  'Điều 98: mức ít nhất 150% ngày thường, 200% ngày nghỉ hằng tuần, 300% ngày lễ/tết; có quy tắc riêng cho ban đêm. Phải biết số giờ, đơn giá và ngày làm việc mới kiểm tra chính xác.',
  LAWS.labor,'Phát hiện dòng OT');
 if(cats.has('bonus'))add('bonus','Thưởng/KPI/hoa hồng',
  'Điều 104 quy định thưởng theo quy chế do người sử dụng lao động quyết định và công bố. Không tự suy ra thưởng là khoản bắt buộc từ nhãn trên bảng lương.',
  LAWS.labor,'Phát hiện khoản thưởng');
 const insuranceKinds=[['social','BHXH',.08],['health','BHYT',.015],['unemployment','BHTN',.01]];
 for(const [category,name,rate] of insuranceKinds){
  const row=find(category);if(!row)continue;
  const ins=find('insuranceBase'),expected=ins?Math.round(ins.amount*rate):null;
  add(category,name+' phần người lao động',
   'Tỷ lệ tham khảo '+(rate*100)+'% trên tiền lương đóng bảo hiểm; '+
    (expected===null?'bảng lương chưa thể hiện rõ cơ sở đóng bảo hiểm.':
      'ước tính '+formatVnd(expected)+', thực tế '+formatVnd(row.amount)+'.')+
    ' Cần xét trần, đối tượng tham gia và quy tắc tính.',
   LAWS.insuranceRate,expected===null?'Thiếu cơ sở đóng':Math.abs(expected-row.amount)<=1?'Khớp số học':'Có chênh lệch cần xem');
 }
 const pit=find('pit'),taxable=find('taxable');
 if(pit||taxable){
  const year=Number(String(period).slice(0,4));
  const expected=taxable&&year>=2026?taxableTax(taxable.amount):null;
  add('pit','Thuế thu nhập cá nhân',
   'Biểu lũy tiến 5 bậc cho thu nhập từ tiền lương của cá nhân cư trú kỳ 2026: 5%, 10%, 20%, 30%, 35%. Giảm trừ bản thân 15.500.000đ/tháng và mỗi người phụ thuộc 6.200.000đ/tháng. '+
   'Số người phụ thuộc khai báo: '+Math.max(0,Number(dependents)||0)+'. '+
   (expected===null?'Chưa đủ thu nhập tính thuế để xác minh phép tính.':
    'Thuế ước tính theo dòng thu nhập tính thuế: '+formatVnd(expected)+'. '),
   LAWS.tax,expected===null?'Chưa đủ căn cứ':pit&&Math.abs(pit.amount-expected)<=1?'Khớp phép tính':'Cần đối chiếu thuế');
 }
 const min=minimumWage(period,region),base=find('base');
 if(min){
  add('minimum','Mức lương tối thiểu vùng '+region,
   'Mức tối thiểu tham chiếu '+formatVnd(min.minimum)+'/tháng. '+
    (base?'Dòng lương cơ bản trong PDF là '+formatVnd(base.amount)+'.':'Chưa xác định được lương cơ bản từ PDF.')+
    ' Đây không phải kết luận tuân thủ: phải xem địa bàn thực tế của đơn vị, thời gian làm việc và thỏa thuận HĐLĐ.',
   min.law,base&&base.amount<min.minimum?'Cần kiểm tra thêm':'Đối chiếu sơ bộ');
 }else{
  add('minimum','Mức lương tối thiểu theo địa bàn',
   'Chọn vùng làm việc của đơn vị và kỳ lương để đối chiếu đúng nghị định. Không sử dụng ngưỡng năm 2027 cho bảng lương 2026.',
   Number(String(period).slice(0,4))>=2027?LAWS.min2027:LAWS.min2026,'Thiếu vùng / kỳ lương');
 }
 add('scope','Giới hạn đánh giá C&B',
  'Không thể xác định chính xác chính sách công ty, loại hợp đồng, thời điểm trả lương, số người phụ thuộc hợp lệ, miễn thuế của từng khoản, công việc đặc thù và bảo hiểm chỉ từ một bảng PDF. Mục này là nghiên cứu tham chiếu, không phải kết luận vi phạm.',
  LAWS.labor,'Bắt buộc xác nhận');
 return {items,summary,sourceReviewed:'2026-11-07'};
}

import {summarizeRows,CATEGORY_LABELS} from './model.js';
import {knowledgeFor} from './laws.js';
// Minimal dependency-free OOXML generator. No third-party workbook script sees payroll data.
// Excel recalculates confirmed formulas on opening. Unproven rows retain source amounts only.
const enc=new TextEncoder();
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
 .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const inline=(r,text,style=0)=>'<c r="'+r+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+esc(text)+'</t></is></c>';
const numeric=(r,value,style=3)=>value===null||!Number.isFinite(Number(value))?'':('<c r="'+r+'" s="'+style+'"><v>'+Number(value)+'</v></c>');
const formula=(r,value,style=3)=>value?
 '<c r="'+r+'" s="'+style+'"><f>'+esc(value.replace(/^=/,''))+'</f></c>':'';
const row=(i,cells,height=22)=>'<row r="'+i+'" ht="'+height+'" customHeight="1">'+cells.join('')+'</row>';
const worksheet=(body,widths,freeze=0,filter='')=>
 '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<sheetViews><sheetView workbookViewId="0">'+(freeze?'<pane ySplit="'+freeze+'" topLeftCell="A'+(freeze+1)+'" activePane="bottomLeft" state="frozen"/>':'')+'</sheetView></sheetViews>'+
 '<sheetFormatPr defaultRowHeight="19"/><cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('')+'</cols>'+
 '<sheetData>'+body+'</sheetData>'+(filter?'<autoFilter ref="'+filter+'"/>':'')+'</worksheet>';
function payrollXml(rows,filename,period){
 const end=6+rows.length;
 let body=row(1,[inline('A1','PAYROLL · C&B INSIGHTS',1)],32);
 body+=row(2,[inline('A2','Nguồn: '+filename+' · Kỳ: '+period,2)],21);
 body+=row(3,[inline('A3','PDF gốc là bằng chứng; bảng này chỉ tái lập dữ liệu OCR và công thức đã đối soát.',2)],21);
 body+=row(4,[inline('A4','Cột D = giá trị gốc; cột F = kết quả công thức nếu khớp. Sửa số liệu gốc tại D để thử kịch bản.',2)],23);
 const headers=['STT','Trang','Dòng/bản ghi PDF','Số gốc (VND)','Phân loại','Công thức kiểm tra','Trạng thái','Giải thích','Văn bản gốc','Chênh lệch'];
 body+=row(6,headers.map((v,i)=>inline('ABCDEFGHIJ'[i]+'6',v,1)),26);
 rows.forEach((r,i)=>{
  const n=i+7;const a=[
   numeric('A'+n,i+1,0),numeric('B'+n,r.page||1,0),inline('C'+n,r.label,0),
   numeric('D'+n,r.amount),inline('E'+n,CATEGORY_LABELS[r.category]||'Thông tin khác'),
   formula('F'+n,r.formula),inline('G'+n,r.status,r.formula?4:5),
   inline('H'+n,r.explanation),inline('I'+n,r.raw),
   ...(r.formula?[formula('J'+n,'IF(ISNUMBER(F'+n+'),F'+n+'-D'+n+',"")')]:[])
  ];body+=row(n,a);
 });
 return worksheet(body,[8,8,46,20,27,23,21,82,74,19],6,rows.length?'A6:J'+end:'');
}
function summaryXml(info){
 const {enriched,summary,filename,period}=info;
 let body=row(1,[inline('A1','SMART INSIGHTS · ĐỐI SOÁT BẢNG LƯƠNG',1)],34);
 body+=row(2,[inline('A2','Tệp nguồn: '+filename+' · Kỳ lương: '+period,2)]);
 const entries=[
  ['Tổng dòng trích xuất',summary.total],
  ['Dòng có giá trị tiền',summary.withAmounts],
  ['Dòng khớp công thức',summary.verified],
  ['Dòng cần xác nhận',summary.review],
  ['Tổng thu nhập ghi nhận',summary.gross],
  ['Tổng khấu trừ ghi nhận',summary.deduction],
  ['Thực nhận ghi nhận',summary.net],
  ['Thuế TNCN ghi nhận',summary.pit],
  ['Cơ sở đóng BH ghi nhận',summary.insurance]
 ];
 entries.forEach(([name,value],i)=>{
  const n=i+5;
  body+=row(n,[inline('A'+n,name,2),numeric('B'+n,value,i>=4?3:0)]);
 });
 body+=row(17,[inline('A17','Không tự điền 0 cho các mục không có trong PDF. Chưa có dữ liệu = ô để trống.',2)]);
 body+=row(19,[inline('A19','Để đối chiếu từng dòng: xem sheet Bảng lương, cột D và F.',2)]);
 body+=row(20,[inline('A20','Tỷ lệ BH và mức TNCN phụ thuộc đối tượng, thời gian và quy định; mọi công thức là công thức đối soát.',2)]);
 return worksheet(body,[49,24,24,24]);
}
function knowledgeXml(knowledge,period,region){
 let body=row(1,[inline('A1','C&B KNOWLEDGE BASE · PHÁP LÝ VIỆT NAM',1)],32);
 body+=row(2,[inline('A2','Kỳ lương: '+period+' · Vùng: '+(region||'chưa chọn')+' · Nguồn rà soát: '+knowledge.sourceReviewed,2)]);
 body+=row(4,['Chế độ / khoản','Đánh giá sơ bộ','Giải thích / lưu ý','Văn bản pháp luật','Nguồn chính thức']
  .map((v,i)=>inline('ABCDE'[i]+'4',v,1)),28);
 knowledge.items.forEach((k,i)=>{
  const n=i+5;
  body+=row(n,[inline('A'+n,k.title),inline('B'+n,k.status,k.status.includes('chênh lệch')?5:2),
   inline('C'+n,k.detail),inline('D'+n,k.law.id),inline('E'+n,k.law.url)],57);
 });
 return worksheet(body,[45,28,106,30,78],4);
}
function notesXml(){
 let body=row(1,[inline('A1','HƯỚNG DẪN VÀ GIỚI HẠN',1)],31);
 const notes=[
  '1. PDF gốc được hiển thị nguyên vẹn trong trang web, không được chỉnh sửa bởi tính năng.',
  '2. Các ô D (giá trị gốc) lưu số mà OCR/trích xuất nhận ra; không thay thế cho chứng từ gốc.',
  '3. Các ô F có công thức chỉ khi kết quả công thức trùng giá trị D tại lúc xuất; dữ liệu không đủ sẽ để trống.',
  '4. Để kiểm tra kịch bản khác, sửa số đầu vào ở cột D và mở lại workbook bằng Excel.',
  '5. Chú thích về BH, thuế, OT, mức tối thiểu chỉ là tham chiếu, chưa phải kết luận tuân thủ.',
  '6. File này chứa dữ liệu lương cá nhân. Không gửi công khai; kiểm soát quyền chia sẻ file.',
  '7. Không có dữ liệu nào được upload sang máy chủ khi tạo file Excel trong trình duyệt.'
 ];
 notes.forEach((v,i)=>{body+=row(i+3,[inline('A'+(i+3),v,2)],32);});
 return worksheet(body,[140]);
}
const u16=(bytes,n)=>{bytes.push(n&255,(n>>>8)&255);};
const u32=(bytes,n)=>{bytes.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);};
function crc32(buf){
 let crc=0xffffffff;
 for(const b of buf){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}
 return (crc^0xffffffff)>>>0;
}
export function zipStore(files){
 const local=[],central=[];
 for(const [filename,content] of Object.entries(files)){
  const name=enc.encode(filename),data=enc.encode(content);
  const offset=local.length,crc=crc32(data);
  u32(local,0x04034b50);u16(local,20);u16(local,0x0800);u16(local,0);u16(local,0);u16(local,0);
  u32(local,crc);u32(local,data.length);u32(local,data.length);u16(local,name.length);u16(local,0);
  for(const byte of name)local.push(byte);
  for(const byte of data)local.push(byte);
  u32(central,0x02014b50);u16(central,20);u16(central,20);u16(central,0x0800);u16(central,0);
  u16(central,0);u16(central,0);u32(central,crc);u32(central,data.length);u32(central,data.length);
  u16(central,name.length);u16(central,0);u16(central,0);u16(central,0);u16(central,0);
  u32(central,0);u32(central,offset);central.push(...name);
 }
 const count=Object.keys(files).length,offset=local.length,combined=[...local,...central];
 u32(combined,0x06054b50);u16(combined,0);u16(combined,0);
 u16(combined,count);u16(combined,count);u32(combined,central.length);u32(combined,offset);u16(combined,0);
 return new Uint8Array(combined);
}
export function buildWorkbookBytes(rows,{filename='bang-luong.pdf',period='2026-11',region='',dependents=0}={}){
 const summary=summarizeRows(rows);
 const knowledge=knowledgeFor(rows,{period,region,dependents});
 const workbook='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
 '<sheets><sheet name="Bảng lương" sheetId="1" r:id="rId1"/><sheet name="Smart Insights" sheetId="2" r:id="rId2"/>'+
 '<sheet name="C&amp;B Knowledge" sheetId="3" r:id="rId3"/><sheet name="Hướng dẫn" sheetId="4" r:id="rId4"/></sheets>'+
 '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
 const relationships='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
 [1,2,3,4].map(i=>'<Relationship Id="rId'+i+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+i+'.xml"/>').join('')+
 '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
 const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
 '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0 &quot;₫&quot;"/></numFmts>'+
 '<fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FF075E3A"/><name val="Aptos"/></font></fonts>'+
 '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+
 '<fill><patternFill patternType="solid"><fgColor rgb="FFFF4500"/><bgColor indexed="64"/></patternFill></fill>'+
 '<fill><patternFill patternType="solid"><fgColor rgb="FFEAF6EF"/><bgColor indexed="64"/></patternFill></fill></fills>'+
 '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
 '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
 '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
 '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/>'+
 '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf>'+
 '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'+
 '<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0"/>'+
 '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>';
 const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
 '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
 '<Default Extension="xml" ContentType="application/xml"/>'+
 '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
 '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
 [1,2,3,4].map(i=>'<Override PartName="/xl/worksheets/sheet'+i+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
 return zipStore({
  '[Content_Types].xml':types,
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':workbook,
  'xl/_rels/workbook.xml.rels':relationships,
  'xl/styles.xml':styles,
  'xl/worksheets/sheet1.xml':payrollXml(summary.enriched,filename,period),
  'xl/worksheets/sheet2.xml':summaryXml({enriched:summary.enriched,summary,filename,period}),
  'xl/worksheets/sheet3.xml':knowledgeXml(knowledge,period,region),
  'xl/worksheets/sheet4.xml':notesXml()
 });
}
export function downloadWorkbook(rows,config){
 const bytes=buildWorkbookBytes(rows,config);
 const name='Payroll-CNB-'+String(config?.period||'unknown').replace(/[^0-9-]/g,'')+'.xlsx';
 const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const uri=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=uri;link.download=name;document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(uri),1000);
}

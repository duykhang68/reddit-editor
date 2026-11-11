// Payslip data stays on this device unless the user explicitly exports it.
export const MAX_PDF_BYTES=15*1024*1024;
export const MAX_PDF_PAGES=30;
export const REVIEW='Cần xác nhận';
export const MATCHED='Khớp phép tính';
export const CATEGORIES=[
 ['base','Lương cơ bản'],['insuranceBase','Lương đóng bảo hiểm'],['days','Ngày công / hệ số'],
 ['allowance','Phụ cấp'],['overtime','Làm thêm giờ'],['bonus','Thưởng / hoa hồng'],
 ['earning','Thu nhập khác'],['gross','Tổng thu nhập'],['social','BHXH (NLĐ)'],
 ['health','BHYT (NLĐ)'],['unemployment','BHTN (NLĐ)'],
 ['taxable','Thu nhập tính thuế'],['pit','Thuế TNCN'],['advance','Tạm ứng'],
 ['deduction','Khấu trừ khác'],['deductionTotal','Tổng khấu trừ'],['net','Thực nhận'],
 ['other','Thông tin khác']
];
export const CATEGORY_LABELS=Object.fromEntries(CATEGORIES);
const normal=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[đĐ]/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
const rule=[
 ['net',/\b(thuc nhan|thuc linh|luong thuc nhan|net pay|net salary|take home|chuyen khoan|tong thuc linh)\b/],
 ['deductionTotal',/\b(tong khau tru|tong cac khoan tru|tong tru|total deductions)\b/],
 ['gross',/\b(tong thu nhap|tong luong|gross salary|gross pay|total earnings|tong cong thu nhap)\b/],
 ['insuranceBase',/\b(muc luong dong bao hiem|luong tham gia bh|luong dong bhxh|insurance base|base for insurance)\b/],
 ['social',/\b(bhxh|bao hiem xa hoi|social insurance)\b/],
 ['health',/\b(bhyt|bao hiem y te|health insurance)\b/],
 ['unemployment',/\b(bhtn|bao hiem that nghiep|unemployment insurance)\b/],
 ['taxable',/\b(thu nhap tinh thue|taxable income)\b/],
 ['pit',/\b(thue tncn|thue thu nhap ca nhan|personal income tax|pit tax)\b/],
 ['advance',/\b(tam ung|ung luong|salary advance)\b/],
 ['deduction',/\b(khau tru|khoan tru|tru luong|phat|deduction)\b/],
 ['overtime',/\b(lam them|tang ca|ngoai gio|overtime|ot\b)\b/],
 ['allowance',/\b(phu cap|ho tro|an trua|xang xe|dien thoai|trach nhiem|allowance)\b/],
 ['bonus',/\b(thuong|hoa hong|kpi|commission|bonus)\b/],
 ['base',/\b(luong co ban|luong hop dong|base salary|basic salary|luong chinh)\b/],
 ['days',/\b(ngay cong|so ngay|he so|working days|cong chuan|gio cong)\b/],
 ['earning',/\b(thu nhap khac|other earnings|thu nhap bo sung)\b/]
];
export function classify(label){
 for(const [type,re] of rule)if(re.test(normal(label)))return type;
 return 'other';
}
export function readVnd(value){
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 const clean=String(value??'').replace(/[\u00a0₫đ]/gi,'').trim();
 const negative=/^[-−(]/.test(clean),numbers=clean.replace(/[^0-9.,]/g,'');
 if(!numbers||(!/^\d{1,3}([.,]\d{3})+$/.test(numbers)&&!/^\d{4,13}$/.test(numbers)))return null;
 const amount=Number(numbers.replace(/[.,]/g,''));
 return Number.isSafeInteger(amount)?(negative?-amount:amount):null;
}
const DATE_WORDS=/\b(?:ngay|thang|nam|date|period|ngay sinh|cmnd|cccd|mst|tai khoan|id|ma nv|ma nhan vien|ma so nhan vien|so dien thoai)\b/i;
function rowId(label,page){let h=2166136261;for(const c of page+':'+label){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return 'p'+page+'-'+(h>>>0).toString(36);}
export function extractLine(line,page=1){
 const raw=String(line??'').trim().replace(/\s+/g,' ');
 if(!raw)return null;
 const matched=[...raw.matchAll(/(?:^|[\s:|])([−-]?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d{4,13}))(?=\s|$|[₫đ)])/gu)];
 const last=matched.at(-1);
 let amount=last?readVnd(last[1]):null;
 const category=classify(raw);
 if(category==='other'&&DATE_WORDS.test(normal(raw)))amount=null;
 const label=last&&amount!==null?raw.slice(0,last.index).replace(/[:| \t-]+$/,'').trim():raw;
 return {id:rowId(raw,page),page,raw,label:label||raw,amount,category,
  status:REVIEW,explanation:'Số trích từ PDF; chưa chứng minh được công thức.'};
}
export function extractLedger(lines){
 return (Array.isArray(lines)?lines:[]).map((row,i)=>extractLine(typeof row==='string'?row:row.text,row.page||1))
  .filter(Boolean).map((r,i)=>({...r,id:r.id+'-'+i})).slice(0,1000);
}
const columnRow=i=>i+7;
const same=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1;
export function taxableTax(amount){
 const v=Math.max(0,Number(amount)||0);
 const slices=[[10000000,.05],[20000000,.10],[30000000,.20],[40000000,.30],[Infinity,.35]];
 let rest=v,total=0;
 for(const [cap,rate] of slices){const portion=Math.min(rest,cap);total+=portion*rate;rest-=portion;if(rest<=0)break;}
 return Math.round(total);
}
export function inferFormulas(input){
 const rows=(Array.isArray(input)?input:[]).map((r,i)=>({...r,excelRow:columnRow(i),status:REVIEW,formula:'',
   expected:null,explanation:'Chưa đủ căn cứ để xác định công thức của dòng này.'}));
 const first=cat=>rows.find(r=>r.category===cat&&r.amount!==null);
 const all=types=>rows.filter(r=>types.includes(r.category)&&r.amount!==null);
 const ref=r=>'D'+r.excelRow;
 const assign=(row,formula,expected,description)=>{
  if(!row||!same(Number(row.amount),expected))return false;
  row.formula=formula;row.expected=expected;row.status=MATCHED;row.explanation=description;return true;
 };
 const insBase=first('insuranceBase');
 for(const [cat,rate] of [['social',.08],['health',.015],['unemployment',.01]]){
  const row=first(cat);
  if(row&&insBase)assign(row,'ROUND('+ref(insBase)+'*'+rate+',0)',
   Math.round(insBase.amount*rate),'Khớp tỷ lệ tham khảo '+(rate*100)+'% trên lương BH; cần xét trần và quy tắc đối tượng.');
 }
 const taxable=first('taxable'),pit=first('pit');
 if(taxable&&pit&&same(pit.amount,taxableTax(taxable.amount))){
  const x=ref(taxable);
  const formula='ROUND(MIN(MAX('+x+',0),10000000)*5%+MIN(MAX('+x+
   '-10000000,0),20000000)*10%+MIN(MAX('+x+
   '-30000000,0),30000000)*20%+MIN(MAX('+x+
   '-60000000,0),40000000)*30%+MAX('+x+'-100000000,0)*35%,0)';
  assign(pit,formula,taxableTax(taxable.amount),
   'Khớp biểu thuế TNCN 5 bậc kỳ 2026, chỉ áp dụng cho cá nhân cư trú nếu điều kiện phù hợp.');
 }
 const gross=first('gross'),earnings=all(['base','allowance','overtime','bonus','earning']);
 if(gross&&earnings.length>=2){
  const sum=earnings.reduce((v,r)=>v+r.amount,0);
  assign(gross,'SUM('+earnings.map(ref).join(',')+')',sum,
   'Các dòng thu nhập nhận diện cộng đúng tổng thu nhập trong PDF.');
 }
 const deductions=all(['social','health','unemployment','pit','advance','deduction']),deduct=first('deductionTotal');
 if(deduct&&deductions.length){
  assign(deduct,'SUM('+deductions.map(ref).join(',')+')',
   deductions.reduce((v,r)=>v+r.amount,0),'Các khoản trừ nhận diện khớp tổng khấu trừ.');
 }
 const net=first('net');
 if(gross&&net){
  if(deduct)assign(net,ref(gross)+'-'+ref(deduct),gross.amount-deduct.amount,
   'Thực nhận = tổng thu nhập - tổng khấu trừ, khớp PDF.');
  else if(deductions.length){
   assign(net,ref(gross)+'-SUM('+deductions.map(ref).join(',')+')',
    gross.amount-deductions.reduce((v,r)=>v+r.amount,0),
    'Thực nhận = tổng thu nhập - các khoản trừ, khớp PDF.');
  }
 }
 return rows;
}
export function summarizeRows(rows){
 const enriched=inferFormulas(rows),first=cat=>enriched.find(r=>r.category===cat&&r.amount!==null)?.amount??null;
 const count=enriched.filter(r=>r.status===MATCHED).length;
 return {enriched,total:enriched.length,withAmounts:enriched.filter(r=>r.amount!==null).length,
   verified:count,review:enriched.length-count,gross:first('gross'),net:first('net'),
   insurance:first('insuranceBase'),deduction:first('deductionTotal'),pit:first('pit')};
}
export const formatVnd=value=>value===null||value===undefined?'—':new Intl.NumberFormat('vi-VN').format(value)+' ₫';
export const legalYear=date=>{const m=String(date||'').match(/\b(20\d{2})\b/);return m?Number(m[1]):2026;};

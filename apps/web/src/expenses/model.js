// Pure expense-domain logic. No loyalty / Stars calculations.
export const STORAGE_KEY = 'dn-daily-expenses-v1';
export const CATEGORIES = Object.freeze([
  {id:'food',label:'Ăn uống',icon:'utensils',tone:'mint',hint:'Đi chợ, siêu thị, ăn tiệm'},
  {id:'coffee',label:'Cà phê',icon:'coffee',tone:'coffee',hint:'Cà phê, quán xá'},
  {id:'transport',label:'Di chuyển',icon:'car',tone:'sky',hint:'Xăng xe, bảo dưỡng, Grab'},
  {id:'utilities',label:'Hóa đơn & Tiện ích',icon:'receipt',tone:'amber',hint:'Điện, nước, internet'},
  {id:'shopping',label:'Mua sắm & Đồ dùng',icon:'bag',tone:'purple',hint:'Đồ dùng, công nghệ'},
  {id:'other',label:'Giải trí & Khác',icon:'spark',tone:'rose',hint:'Phim ảnh, phát sinh'}
]);
export const money = value => new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(value||0);
export function todayVN(date=new Date()) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const pick=type=>parts.find(p=>p.type===type)?.value;
  return pick('year')+'-'+pick('month')+'-'+pick('day');
}
export const monthOf = date => date.slice(0,7);
export function monthBefore(month) {
  const [y,m]=month.split('-').map(Number);
  return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
}
export function daysInMonth(month) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('Tháng không hợp lệ');
  const [y,m]=month.split('-').map(Number);
  return new Date(Date.UTC(y,m,0)).getUTCDate();
}
export function validDate(value) {
  if(typeof value!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number);
  return year>=2000&&year<=2100&&day>=1&&day<=daysInMonth(value.slice(0,7));
}
export function amountValue(value,{zero=false}={}) {
  if(value===''||value===null||value===undefined) {
    if(zero)return null;
    throw Error('Vui lòng nhập số tiền.');
  }
  if(!/^\d+(?:\.0+)?$/.test(String(value).trim()))throw Error('Số tiền phải là số nguyên VND, không âm.');
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0||(!zero&&n===0)||n>1e12)throw Error('Số tiền phải lớn hơn 0 và tối đa 1.000 tỷ VND.');
  return n;
}
export function normalizeTransaction(source,categories=CATEGORIES) {
  const id=String(source?.id||'').trim();
  if(!id||id.length>100)throw Error('ID giao dịch không hợp lệ.');
  if(!validDate(source.date))throw Error('Ngày giao dịch không hợp lệ.');
  const categoryId=String(source.categoryId||'');
  if(!categories.some(item=>item.id===categoryId))throw Error('Danh mục không tồn tại.');
  const note=String(source.note||'').trim();
  if(note.length>180)throw Error('Ghi chú tối đa 180 ký tự.');
  return {id,date:source.date,amount:amountValue(source.amount),categoryId,note};
}
export function newCategory(label,existing=CATEGORIES) {
  const clean=String(label||'').trim().replace(/\s+/g,' ');
  if(clean.length<2||clean.length>48)throw Error('Tên danh mục cần từ 2 đến 48 ký tự.');
  if(existing.some(item=>item.label.toLocaleLowerCase('vi-VN')===clean.toLocaleLowerCase('vi-VN')))
    throw Error('Danh mục đã tồn tại. Hãy chọn trong danh sách.');
  const slug=clean.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,32)||'custom';
  const ids=new Set(existing.map(item=>item.id));
  let id='custom-'+slug, index=2;
  while(ids.has(id))id='custom-'+slug+'-'+index++;
  return {id,label:clean,icon:'tag',tone:'custom',hint:'Danh mục tự tạo'};
}
export function emptyData() {return {version:1,transactions:[],customCategories:[],budgets:{}};}
export function allCategories(data) {return [...CATEGORIES,...(data.customCategories||[])];}
export function normalizeData(raw) {
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.transactions)||!Array.isArray(raw.customCategories))throw Error('File dữ liệu không đúng cấu trúc.');
  if(raw.transactions.length>30000||raw.customCategories.length>200)throw Error('Dữ liệu vượt giới hạn cho phép.');
  const custom=[];
  for(const item of raw.customCategories){
    const candidate=newCategory(item.label,[...CATEGORIES,...custom]);
    const id=String(item.id||'');
    if(!/^custom-[a-z0-9-]{1,80}$/.test(id)||[...CATEGORIES,...custom].some(x=>x.id===id))throw Error('Mã danh mục không hợp lệ hoặc trùng.');
    custom.push({...candidate,id});
  }
  const categories=[...CATEGORIES,...custom];
  const transactions=raw.transactions.map(tx=>normalizeTransaction(tx,categories));
  if(new Set(transactions.map(tx=>tx.id)).size!==transactions.length)throw Error('Giao dịch trùng ID.');
  const budgets={};
  const entries=Object.entries(raw.budgets||{});
  if(entries.length>1000)throw Error('Quá nhiều kỳ ngân sách.');
  for(const [month,entry] of entries){
    daysInMonth(month);
    if(!entry||typeof entry!=='object')throw Error('Ngân sách không hợp lệ.');
    const categoriesBudget={};
    for(const [id,limit] of Object.entries(entry.categories||{})){
      if(!categories.some(item=>item.id===id))throw Error('Ngân sách có danh mục lạ.');
      categoriesBudget[id]=amountValue(limit,{zero:true});
    }
    budgets[month]={total:amountValue(entry.total,{zero:true}),categories:categoriesBudget};
  }
  return {version:1,transactions,customCategories:custom,budgets};
}
export function getBudget(data,month) {
  const b=data.budgets?.[month]||{};
  return {total:b.total??null,categories:b.categories||{}};
}
export function spendingMetrics(data,month,now=todayVN()) {
  const categories=allCategories(data);
  const items=data.transactions.filter(item=>monthOf(item.date)===month);
  const previous=data.transactions.filter(item=>monthOf(item.date)===monthBefore(month));
  const daily=new Map(),categoryAmounts={};
  let spent=0;
  for(const item of items){
    spent+=item.amount;
    daily.set(item.date,(daily.get(item.date)||0)+item.amount);
    categoryAmounts[item.categoryId]=(categoryAmounts[item.categoryId]||0)+item.amount;
  }
  const categorySpending=categories.map(category=>({...category,amount:categoryAmounts[category.id]||0})).sort((a,b)=>b.amount-a.amount);
  const b=getBudget(data,month);
  const elapsed=month<monthOf(now)?daysInMonth(month):month===monthOf(now)?Number(now.slice(8)):0;
  const average=elapsed>0?spent/elapsed:0;
  const forecast=month===monthOf(now)&&elapsed>0?average*daysInMonth(month):null;
  const dailyRows=[...daily].map(([date,amount])=>({date,amount})).sort((a,b)=>a.date.localeCompare(b.date));
  // Anomaly only if there is enough real history; median of positive-spend days.
  const values=dailyRows.map(row=>row.amount).sort((a,b)=>a-b);
  const median=values.length%2 ? values[Math.floor(values.length/2)] : (values[values.length/2-1]+values[values.length/2])/2;
  const anomalies=dailyRows.length>=4 ? dailyRows.filter(row=>row.amount>=100000 && row.amount>median*1.85 && row.amount>average*1.5) : [];
  const warnings=categorySpending.filter(item=>b.categories[item.id]!=null && (b.categories[item.id]===0 ? item.amount>0 : item.amount>=b.categories[item.id]*0.8))
    .map(item=>({...item,limit:b.categories[item.id],percent:b.categories[item.id]===0?Infinity:item.amount/b.categories[item.id]*100}));
  const prevAmounts={};
  for(const item of previous)prevAmounts[item.categoryId]=(prevAmounts[item.categoryId]||0)+item.amount;
  const top=categorySpending[0]?.amount?categorySpending[0]:null;
  const remaining=b.total===null?null:b.total-spent;
  const daysLeft=month===monthOf(now)?daysInMonth(month)-Number(now.slice(8)):0;
  return {items,spent,previous,categorySpending,dailyRows,average,forecast,elapsed,top,topPrevious:top?(prevAmounts[top.id]||0):0,
    anomalies,warnings,limit:b.total,remaining,daysLeft,month,now};
}
export function insightTips(metrics) {
  if(!metrics.items.length)return ['Chưa có giao dịch trong tháng. Thêm khoản chi đầu tiên để bắt đầu phân tích.'];
  const result=[];
  if(metrics.warnings.some(item=>item.percent>=100))result.push('Một số danh mục đã chạm hạn mức. Ưu tiên khoản thiết yếu và rà soát chi phí mới.');
  else if(metrics.warnings.length)result.push('Có danh mục đã sử dụng ít nhất 80% hạn mức. Kiểm tra trước khi chi thêm.');
  if(metrics.forecast!=null&&metrics.limit!=null&&metrics.limit>0&&metrics.forecast>metrics.limit)
    result.push('Với tốc độ hiện tại, dự báo cuối tháng vượt ngân sách. Cân nhắc giảm các khoản linh hoạt.');
  if(metrics.anomalies.length)result.push('Có ngày chi tiêu đột biến; kiểm tra xem đây là khoản chi một lần hay lặp lại.');
  if(metrics.remaining!==null&&metrics.daysLeft>0)
    result.push('Ngân sách còn lại bình quân '+money(Math.max(0,metrics.remaining)/metrics.daysLeft)+'/ngày trong '+metrics.daysLeft+' ngày còn lại.');
  if(!result.length)result.push('Giữ thói quen ghi chép mỗi ngày để theo dõi ngân sách chính xác hơn.');
  return result.slice(0,3);
}
export function toCsv(rows,categories) {
  const labels=new Map(categories.map(item=>[item.id,item.label]));
  const esc=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  return '\uFEFF'+[['id','date','category','amount_vnd','note'],...rows.map(tx=>[tx.id,tx.date,labels.get(tx.categoryId)||tx.categoryId,tx.amount,tx.note])].map(line=>line.map(esc).join(',')).join('\r\n');
}

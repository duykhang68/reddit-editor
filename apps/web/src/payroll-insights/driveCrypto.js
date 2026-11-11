// Sensitive payroll content: encrypt before any optional Google Drive request.
// PBKDF2 + AES-256-GCM authentication; passphrase is never stored on disk or Drive.
export const PAYROLL_ENCRYPTED_KIND='duynguyen-payroll-encrypted-v1';
const enc=new TextEncoder(),dec=new TextDecoder();
const toBase64=bytes=>{
 let str='';
 for(let i=0;i<bytes.length;i+=8192)str+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(str);
};
const fromBase64=source=>Uint8Array.from(atob(source),c=>c.charCodeAt(0));
export function normalizePayrollBackup(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Dữ liệu Payroll không hợp lệ.');
 if(!Array.isArray(data.rows)||data.rows.length>1000)throw new Error('Dữ liệu Payroll phải có danh sách tối đa 1.000 dòng.');
 const validCategories=new Set(['base','insuranceBase','days','allowance','overtime','bonus','earning',
  'gross','social','health','unemployment','taxable','pit','advance','deduction',
  'deductionTotal','net','other']);
 const rows=data.rows.map((row,index)=>{
  const amount=row?.amount===null||row?.amount===undefined?null:Number(row.amount);
  if(amount!==null&&(!Number.isSafeInteger(amount)||Math.abs(amount)>1e15))
    throw new Error('Giá trị lương trong bản sao không hợp lệ ở dòng '+(index+1)+'.');
  return {
   id:String(row?.id||'row-'+index).slice(0,100),
   page:Math.max(1,Math.min(30,Number(row?.page)||1)),
   label:String(row?.label||'').slice(0,500),
   raw:String(row?.raw||'').slice(0,1000),
   amount,category:validCategories.has(row?.category)?row.category:'other'
  };
 });
 return {version:1,filename:String(data.filename||'payroll.pdf').slice(0,180),
  period:/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(data.period||''))?data.period:'2026-11',
  region:['I','II','III','IV'].includes(data.region)?data.region:'',
  dependents:Math.max(0,Math.min(30,Number(data.dependents)||0)),rows};
}
async function derive(password,salt){
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},
  key,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptPayrollData(data,passphrase){
 if(typeof passphrase!=='string'||passphrase.length<12)
  throw new Error('Mật khẩu mã hóa phải dài ít nhất 12 ký tự. Quên mật khẩu sẽ không giải mã được bản sao.');
 const normalized=normalizePayrollBackup(data);
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await derive(passphrase,salt);
 const bytes=await crypto.subtle.encrypt({name:'AES-GCM',iv},
  key,enc.encode(JSON.stringify(normalized)));
 return {kind:PAYROLL_ENCRYPTED_KIND,alg:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:310000,
  salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(bytes))};
}
export async function decryptPayrollData(payload,passphrase){
 if(payload?.kind!==PAYROLL_ENCRYPTED_KIND||payload?.alg!=='AES-256-GCM'||
  typeof payload?.ciphertext!=='string'||!payload?.salt||!payload?.iv)
  throw new Error('Bản sao không đúng định dạng mã hóa Payroll.');
 try{
  const salt=fromBase64(payload.salt),iv=fromBase64(payload.iv);
  if(salt.length!==16||iv.length!==12)throw new Error('Wrong IV');
  const key=await derive(passphrase,salt);
  const output=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,fromBase64(payload.ciphertext));
  return normalizePayrollBackup(JSON.parse(dec.decode(output)));
 }catch{throw new Error('Không giải mã được. Kiểm tra mật khẩu hoặc tính toàn vẹn của bản sao. Không ghi đè dữ liệu hiện tại.');}
}
export async function payrollFingerprint(data){
 const content=enc.encode(JSON.stringify(normalizePayrollBackup(data)));
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',content));
 return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
}

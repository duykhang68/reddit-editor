import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encryptPayrollData,decryptPayrollData,normalizePayrollBackup,payrollFingerprint} from '../src/payroll-insights/driveCrypto.js';
import {buildWorkbookBytes} from '../src/payroll-insights/xlsxExport.js';
import {minimumWage} from '../src/payroll-insights/laws.js';

const salary={filename:'confidential-employment-payroll.pdf',period:'2026-11',region:'I',dependents:1,
 rows:[{id:'salary1',page:1,label:'Lương cơ bản',raw:'Lương cơ bản 20.000.000',amount:20000000,category:'base'}]};
test('Payroll backup uses authenticated AES-256 ciphertext and never exposes salary or filename',async()=>{
 const passphrase='strong payroll secret 2026';
 const encrypted=await encryptPayrollData(salary,passphrase);
 assert.equal(encrypted.kind,'duynguyen-payroll-encrypted-v1');
 assert.equal(encrypted.alg,'AES-256-GCM');
 assert.equal(encrypted.iterations,310000);
 assert.equal(encrypted.iv.length>0,true);
 const json=JSON.stringify(encrypted);
 assert.doesNotMatch(json,/20000000|Lương cơ bản|confidential-employment|payroll\.pdf/);
 const restored=await decryptPayrollData(encrypted,passphrase);
 assert.deepEqual(restored,normalizePayrollBackup(salary));
});
test('Payroll backup password mistakes or ciphertext tampering never return any data',async()=>{
 const encrypted=await encryptPayrollData(salary,'strong payroll secret 2026');
 await assert.rejects(decryptPayrollData(encrypted,'wrong password 123456'),/Không giải mã được/);
 const broken={...encrypted,ciphertext:encrypted.ciphertext.slice(0,-3)+'AAA'};
 await assert.rejects(decryptPayrollData(broken,'strong payroll secret 2026'),/Không giải mã được/);
 await assert.rejects(encryptPayrollData(salary,'short'),/ít nhất 12 ký tự/);
});
test('Payroll backup validates amounts, rows and preserves exact source rows',async()=>{
 const normalized=normalizePayrollBackup(salary);
 assert.equal(normalized.rows.length,1);
 assert.equal(normalized.rows[0].amount,20000000);
 assert.throws(()=>normalizePayrollBackup({...salary,rows:[{amount:Infinity}]}),/không hợp lệ/);
 assert.throws(()=>normalizePayrollBackup({...salary,rows:null}),/danh sách/);
 const first=await payrollFingerprint(salary);
 const changed=await payrollFingerprint({...salary,rows:[{...salary.rows[0],amount:20000001}]});
 assert.notEqual(first,changed);
});
test('Google Drive API only accepts encrypted snapshots and isolates payroll from other tags',()=>{
 const path=new URL('../src/services/googleDriveService.js',import.meta.url);
 const source=readFileSync(path,'utf8');
 assert.match(source,/dn_payroll/);
 assert.match(source,/encrypted_snapshot_v1/);
 assert.match(source,/readPayrollState/);
 assert.match(source,/savePayrollEncryptedSnapshot/);
 assert.match(source,/Chỉ được upload snapshot Payroll đã mã hóa/);
 assert.match(source,/PAYROLL_CONFLICT/);
 assert.doesNotMatch(source,/dn_payroll.*snapshot_v1.*STARBUCKS/);
});
test('Backup UI is opt-in, exposes 3-minute manual sync, and leaves PDF bytes local',()=>{
 const source=readFileSync(new URL('../src/payroll-insights/main.jsx',import.meta.url),'utf8');
 const hook=readFileSync(new URL('../src/payroll-insights/usePayrollDriveSync.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../payroll-insights/index.html',import.meta.url),'utf8');
 assert.match(source,/usePayrollDriveSync\(drivePayload,restoreFromDrive\)/);
 assert.match(source,/TẮT THEO MẶC ĐỊNH/);
 assert.match(source,/đã mã hóa AES-256/);
 assert.match(source,/PDF gốc không được upload/);
 assert.match(source,/Đồng bộ ngay/);
 assert.match(source,/Giải mã & khôi phục từ Drive/);
 assert.match(hook,/const WAIT_MS=180000,AFTER_CHANGE_MS=12000/);
 assert.match(hook,/\[enabled,setEnabled\]=useState\(false\)/);
 assert.match(hook,/encryptPayrollData\(snapshot,password\.current\)/);
 assert.match(hook,/googleDrive\.savePayrollEncryptedSnapshot\(encrypted/);
 assert.doesNotMatch(source,/useEffect\(\(\)=>\(\)=>\{generation\.current\+=1;if\(url\)/);
 assert.match(html,/accounts\.google\.com\/gsi\/client/);
});
test('Large workbook construction does not crash with spread argument overflow',()=>{
 const rows=Array.from({length:950},(_,i)=>({
  id:'p-'+i,page:1,raw:'Lương minh họa '+i+' '.repeat(5)+'a'.repeat(120),
  label:'Khoản chi số '+i+' '.repeat(5)+'b'.repeat(120),category:'other',amount:i+1000
 }));
 const bytes=buildWorkbookBytes(rows,{filename:'long.pdf',period:'2026-11'});
 assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
 assert.ok(bytes.length>100000);
});
test('Do not apply 2027 minimum wage figures indefinitely to later years',()=>{
 assert.equal(minimumWage('2028-01','I'),null);
});

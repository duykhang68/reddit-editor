import {normalizeData} from '../expenses/model.js';

// D1 row size is capped at 2 MB; leave headroom for owner, revision, and metadata.
export const MAX_CLOUD_PAYLOAD_BYTES = 1_500_000;

export class ExpenseCloudError extends Error {
  constructor(status,message,code) {super(message);this.status=status;this.code=code;}
}
const fail=(status,message,code)=>{throw new ExpenseCloudError(status,message,code);};

function requireDb(db) {
  if(!db||typeof db.prepare!=='function')fail(503,
    'Chưa cấu hình Cloudflare D1: tạo cơ sở dữ liệu và liên kết binding EXPENSES_DB với Pages project.',
    'EXPENSES_DB_MISSING');
  return db;
}
function requireOwner(owner) {
  if(!/^\d{1,30}$/.test(String(owner||'')))fail(502,'Không xác minh được tài khoản Google Blogger.','EXPENSES_IDENTITY_ERROR');
  return String(owner);
}
async function ensureSchema(db) {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS expenses_snapshots ('+
    'owner_id TEXT PRIMARY KEY NOT NULL, '+
    'revision INTEGER NOT NULL, '+
    'payload TEXT NOT NULL, '+
    'updated_at TEXT NOT NULL)'
  ).run();
}
function encodeData(raw) {
  let data;
  try { data=normalizeData(raw); }
  catch(error) {fail(400,'Dữ liệu chi tiêu không hợp lệ: '+error.message,'EXPENSES_VALIDATION');}
  const payload=JSON.stringify(data);
  if(new TextEncoder().encode(payload).length>MAX_CLOUD_PAYLOAD_BYTES)
    fail(413,'Dữ liệu vượt 1,5 MB cho một bản sao cloud. Hãy xuất JSON để sao lưu và liên hệ nâng cấp lưu trữ.','EXPENSES_TOO_LARGE');
  return payload;
}

export async function loadExpenseCloud({db,ownerId}) {
  db=requireDb(db);
  const owner=requireOwner(ownerId);
  await ensureSchema(db);
  const row=await db.prepare(
    'SELECT revision, payload, updated_at FROM expenses_snapshots WHERE owner_id = ?'
  ).bind(owner).first();
  if(!row)return {exists:false,revision:0,updatedAt:null,data:null};
  let data;
  try {data=normalizeData(JSON.parse(row.payload));}
  catch {fail(500,'Dữ liệu cloud bị lỗi. Không ghi đè bản hiện tại.','EXPENSES_CORRUPT');}
  return {exists:true,revision:Number(row.revision),updatedAt:String(row.updated_at),data};
}

export async function writeExpenseCloud({db,ownerId,expectedRevision,data}) {
  db=requireDb(db);
  const owner=requireOwner(ownerId);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
    fail(400,'expectedRevision không hợp lệ.','EXPENSES_REVISION');
  const payload=encodeData(data);
  await ensureSchema(db);
  const updatedAt=new Date().toISOString();
  let result;
  if(expectedRevision===0){
    result=await db.prepare(
      'INSERT INTO expenses_snapshots (owner_id, revision, payload, updated_at) '+
      'VALUES (?, 1, ?, ?) ON CONFLICT(owner_id) DO NOTHING'
    ).bind(owner,payload,updatedAt).run();
  }else{
    result=await db.prepare(
      'UPDATE expenses_snapshots SET revision = revision + 1, payload = ?, updated_at = ? '+
      'WHERE owner_id = ? AND revision = ?'
    ).bind(payload,updatedAt,owner,expectedRevision).run();
  }
  if(Number(result?.meta?.changes||0)!==1){
    fail(409,'Bản dữ liệu trên cloud đã thay đổi ở thiết bị khác. Không tự ghi đè; hãy xử lý xung đột.','EXPENSES_CONFLICT');
  }
  return {ok:true,revision:expectedRevision+1,updatedAt};
}

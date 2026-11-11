export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3/files';
const FIELDS = 'id,name,modifiedTime,version';

// Tokens live only in this closure, never in localStorage or the backend.
export function createDriveService({fetcher = (...args) => fetch(...args), oauth = () => globalThis.google?.accounts?.oauth2, now = Date.now, scope = DRIVE_SCOPE} = {}) {
  let token = null, expires = 0, pending = false, generation = 0;
  const disconnect = () => { generation++; token = null; expires = 0; pending = false; };
  const connected = () => !!token && now() < expires;
  function login(clientId) {
    if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) return Promise.reject(new Error('Nhập OAuth Client ID hợp lệ từ Google Cloud.'));
    if (!oauth()) return Promise.reject(new Error('Google Identity Services chưa tải. Kiểm tra mạng rồi thử lại.'));
    if (pending) return Promise.reject(new Error('Đang chờ đăng nhập Google.'));
    pending = true;
    const attempt = ++generation;
    return new Promise((resolve, reject) => {
      const fail = error => { if (attempt === generation) pending = false; reject(new Error(error)); };
      try {
        const client = oauth().initTokenClient({
          client_id: clientId, scope, include_granted_scopes: false,
          callback: response => {
            if (attempt !== generation) return fail('Kết nối đã bị hủy.');
            if (response.error || !response.access_token) return fail('Google từ chối quyền Drive: ' + (response.error || 'thiếu token'));
            if (!oauth().hasGrantedAllScopes(response, ...scope.split(' '))) return fail('Bạn chưa cấp quyền Google cần thiết. Hãy kết nối lại.');
            token = response.access_token;
            expires = now() + Math.max(0, Number(response.expires_in || 3600) - 30) * 1000;
            pending = false; resolve();
          },
          error_callback: error => fail(error.type === 'popup_closed' ? 'Bạn đã đóng cửa sổ Google.' : 'Không mở được cửa sổ Google. Hãy cho phép popup và thử lại.')
        });
        // Let Google reuse the existing account and previously granted scopes.
        // GIS will show consent/account selection only when required by Google.
        client.requestAccessToken({prompt: ''});
      } catch (error) { fail(error.message); }
    });
  }
  async function request(url, options = {}) {
    if (!connected()) { disconnect(); throw new Error('Phiên Drive hết hạn hoặc chưa kết nối. Bấm Kết nối Drive để tiếp tục.'); }
    const response = await fetcher(url, {...options, headers: {...options.headers, Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(30000)});
    if (!response.ok) {
      if (response.status === 401) disconnect();
      const data = await response.json().catch(() => ({}));
      const hint = response.status === 401 ? 'Kết nối Drive lại.' : response.status === 412 ? 'File đã thay đổi trên Drive. Mở lại file trước khi lưu.' : response.status === 403 ? 'Kiểm tra Drive API đã bật và quyền drive.file đã được cấp.' : '';
      throw new Error(`Drive HTTP ${response.status}: ${data.error?.message || response.statusText}. ${hint}`);
    }
    return response;
  }
  async function listBlogPosts() {
    let pageToken = '', files = [];
    do {
      const params = new URLSearchParams({q: "trashed=false and (mimeType='text/markdown' or (mimeType='text/plain' and name contains '.md'))", fields: `nextPageToken,files(${FIELDS})`, orderBy: 'modifiedTime desc', pageSize: '100'});
      if (pageToken) params.set('pageToken', pageToken);
      const data = await (await request(`${API}?${params}`)).json();
      files.push(...(data.files || [])); pageToken = data.nextPageToken || '';
    } while (pageToken);
    return files;
  }
  async function readMarkdown(fileId) {
    const id = encodeURIComponent(fileId);
    const metadataResponse = await request(`${API}/${id}?fields=${FIELDS}`);
    const metadata = await metadataResponse.json();
    const etag = metadataResponse.headers.get('etag');
    const response = await request(`${API}/${id}?alt=media`, {headers: etag ? {'If-Match': etag} : {}});
    return {...metadata, content: await response.text(), etag: metadataResponse.headers.get('etag')};
  }
  async function saveMarkdownToDrive(fileName, content, existing = null) {
    if (new Blob([content]).size > 5 * 1024 * 1024) throw new Error('Bài vượt quá giới hạn 5 MB. Hãy giảm nội dung trước khi lưu.');
    const name = fileName.trim().replace(/[\/\\\u0000-\u001f]/g, '-').slice(0, 200);
    if (!name) throw new Error('Nhập tiêu đề trước khi lưu Drive.');
    const metadata = {name: /\.md$/i.test(name) ? name : name + '.md', mimeType: 'text/markdown'};
    // Drive requires multipart/related, not the multipart/form-data produced by FormData.
    const boundary = 'editor_' + crypto.randomUUID();
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metadata), `\r\n--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n`, content, `\r\n--${boundary}--\r\n`]);
    const suffix = existing ? '/' + encodeURIComponent(existing.id) : '';
    if (existing) {
      if (!existing.version) throw new Error('Chưa có phiên bản file để cập nhật. Hãy mở lại bài từ Drive.');
      const latest = await (await request(`${API}/${encodeURIComponent(existing.id)}?fields=${FIELDS}`)).json();
      if (String(latest.version) !== String(existing.version)) throw new Error('File đã thay đổi trên Drive. Mở lại file trước khi lưu.');
    }
    const response = await request(`https://www.googleapis.com/upload/drive/v3/files${suffix}?uploadType=multipart&fields=${FIELDS}`, {
      method: existing ? 'PATCH' : 'POST', headers: {'Content-Type': `multipart/related; boundary=${boundary}`, ...(existing?.etag ? {'If-Match': existing.etag} : {})}, body
    });
    return {...await response.json(), etag: response.headers.get('etag')};
  }
  // Personal expenses use the same GIS token and drive.file scope as Drive Markdown.
  // Immutable snapshots prevent either device from destroying an older cloud backup.
  const EXPENSES_TAG='dn_expenses';
  const EXPENSES_VALUE='snapshot_v1';
  const EXPENSES_FIELDS='id,name,mimeType,createdTime,modifiedTime,version,appProperties';
  async function driveIdentity() {
    const r=await request('https://www.googleapis.com/drive/v3/about?fields=user(permissionId)');
    const user=await r.json();
    const ownerId=String(user?.user?.permissionId||'').trim();
    if(!ownerId)throw new Error('Google Drive không trả về ID chủ sở hữu. Không thể đồng bộ an toàn.');
    return ownerId;
  }
  async function listExpenseSnapshots() {
    let token='',files=[],pages=0;
    do {
      const params=new URLSearchParams({
        q:"trashed = false and appProperties has { key = 'dn_expenses' and value = 'snapshot_v1' }",
        fields:'nextPageToken,files('+EXPENSES_FIELDS+')',
        orderBy:'createdTime desc',pageSize:'100'
      });
      if(token)params.set('pageToken',token);
      const body=await (await request(API+'?'+params)).json();
      files.push(...(body.files||[]).filter(file=>file.appProperties?.[EXPENSES_TAG]===EXPENSES_VALUE));
      token=body.nextPageToken||'';
      if(++pages>100)throw new Error('Quá nhiều trang snapshot Google Drive, cần kiểm tra và dọn lịch sử.');
    }while(token);
    return files.sort((a,b)=>String(b.createdTime||b.modifiedTime||'').localeCompare(String(a.createdTime||a.modifiedTime||''))||
      String(b.id).localeCompare(String(a.id)));
  }
  async function readExpenseSnapshot(file) {
    if(!file?.id)throw new Error('Snapshot Drive không có ID.');
    const res=await request(API+'/'+encodeURIComponent(file.id)+'?alt=media');
    let envelope;
    try{envelope=JSON.parse(await res.text());}
    catch{throw new Error('File sao lưu chi tiêu trên Drive không phải JSON hợp lệ. Không tự ghi đè.');}
    if(envelope?.kind!=='duynguyen-expenses-snapshot-v1'||!envelope.data)
      throw new Error('File Drive không đúng định dạng sao lưu chi tiêu. Không tự ghi đè.');
    let data;
    try {data=(await import('../expenses/model.js')).normalizeData(envelope.data);}
    catch(error) {throw new Error('Dữ liệu JSON Drive không hợp lệ: '+error.message);}
    return {data,baseId:String(envelope.baseId||''),file};
  }
  async function readExpenseState() {
    const ownerId=await driveIdentity();
    const files=await listExpenseSnapshots();
    if(!files.length)return {ownerId,exists:false,snapshotId:'',revision:0,updatedAt:null,data:null};
    const latest=files[0];
    const loaded=await readExpenseSnapshot(latest);
    // Track the immutable ancestry. Parallel uploads from the same base are forks,
    // not replacements; never auto-pull over a fork that lacks our latest file.
    const byId=new Map(files.map(file=>[String(file.id),file]));
    const ancestors=[];
    const seen=new Set([String(latest.id)]);
    let cursor=String(latest.appProperties?.base_id||'');
    while(cursor&&cursor!=='root'&&byId.has(cursor)&&!seen.has(cursor)){
      ancestors.push(cursor);seen.add(cursor);
      cursor=String(byId.get(cursor).appProperties?.base_id||'');
    }
    return {ownerId,exists:true,snapshotId:String(latest.id),revision:Number(latest.version||1),
      updatedAt:latest.createdTime||latest.modifiedTime||null,data:loaded.data,
      baseId:loaded.baseId,fileName:latest.name,ancestorIds:ancestors};
  }
  async function saveExpenseSnapshot(data,expectedFileId='') {
    const {normalizeData}=await import('../expenses/model.js');
    const normalized=normalizeData(data);
    const json=JSON.stringify({kind:'duynguyen-expenses-snapshot-v1',savedAt:new Date(now()).toISOString(),
      baseId:expectedFileId||'',data:normalized});
    if(new Blob([json]).size>4*1024*1024)
      throw new Error('Bản JSON chi tiêu lớn hơn 4 MB; hãy xuất file JSON trước khi đồng bộ.');
    // Check the previous head before adding a new immutable snapshot.
    const snapshots=await listExpenseSnapshots();
    if(String(snapshots[0]?.id||'')!==String(expectedFileId||'')){
      const error=new Error('Drive đã có dữ liệu mới từ một thiết bị khác. Không ghi đè; hãy xử lý xung đột.');
      error.code='EXPENSES_CONFLICT';error.status=409;throw error;
    }
    const stamp=new Date(now()).toISOString().replace(/[:.]/g,'-');
    const uuid=crypto.randomUUID();
    const metadata={
      name:'DuyNguyen-Expenses-'+stamp+'-'+uuid.slice(0,8)+'.json',
      mimeType:'application/json',
      description:'Duy Nguyen · Daily Expenses & Insights · Private backup',
      appProperties:{[EXPENSES_TAG]:EXPENSES_VALUE,base_id:String(expectedFileId||'root')}
    };
    const boundary='dn_expenses_'+uuid.replace(/-/g,'');
    const body=new Blob([
      '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      json,'\r\n--'+boundary+'--\r\n'
    ]);
    const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields='+encodeURIComponent(EXPENSES_FIELDS),{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
    });
    const file=await response.json();
    if(!file?.id)throw new Error('Google Drive không trả ID file sau khi lưu. Kiểm tra Drive trước khi thử lại.');
    // A read-back is stronger evidence than a successful POST alone.
    const stored=await readExpenseSnapshot(file);
    if(JSON.stringify(stored.data)!==JSON.stringify(normalized))
      throw new Error('Nội dung Drive khác bản gửi. Không xác nhận đồng bộ.');
    return {ownerId:await driveIdentity(),exists:true,snapshotId:String(file.id),
      revision:Number(file.version||1),updatedAt:file.createdTime||file.modifiedTime||new Date(now()).toISOString(),
      data:stored.data,fileName:file.name};
  }
  // Starbucks backups are isolated from personal expenses by their appProperties.
  const STARBUCKS_TAG='dn_starbucks';
  const STARBUCKS_VALUE='snapshot_v1';
  const STARBUCKS_FIELDS='id,name,mimeType,createdTime,modifiedTime,version,appProperties';
  async function listStarbucksSnapshots() {
    let token='',files=[],pages=0;
    do {
      const params=new URLSearchParams({
        q:"trashed = false and appProperties has { key = 'dn_starbucks' and value = 'snapshot_v1' }",
        fields:'nextPageToken,files('+STARBUCKS_FIELDS+')',
        orderBy:'createdTime desc',pageSize:'100'
      });
      if(token)params.set('pageToken',token);
      const body=await (await request(API+'?'+params)).json();
      files.push(...(body.files||[]).filter(file=>file.appProperties?.[STARBUCKS_TAG]===STARBUCKS_VALUE));
      token=body.nextPageToken||'';
      if(++pages>100)throw new Error('Quá nhiều trang snapshot Google Drive, cần kiểm tra và dọn lịch sử.');
    }while(token);
    return files.sort((a,b)=>String(b.createdTime||b.modifiedTime||'').localeCompare(String(a.createdTime||a.modifiedTime||''))||
      String(b.id).localeCompare(String(a.id)));
  }
  async function readStarbucksSnapshot(file) {
    if(!file?.id)throw new Error('Snapshot Drive không có ID.');
    const res=await request(API+'/'+encodeURIComponent(file.id)+'?alt=media');
    let envelope;
    try{envelope=JSON.parse(await res.text());}
    catch{throw new Error('File sao lưu Starbucks trên Drive không phải JSON hợp lệ. Không tự ghi đè.');}
    if(envelope?.kind!=='duynguyen-starbucks-snapshot-v1'||!envelope.data)
      throw new Error('File Drive không đúng định dạng sao lưu Starbucks. Không tự ghi đè.');
    let data;
    try {data=(await import('../starbucks-insights/driveSync.js')).normalizeData(envelope.data);}
    catch(error) {throw new Error('Dữ liệu JSON Drive không hợp lệ: '+error.message);}
    return {data,baseId:String(envelope.baseId||''),file};
  }
  async function readStarbucksState() {
    const ownerId=await driveIdentity();
    const files=await listStarbucksSnapshots();
    if(!files.length)return {ownerId,exists:false,snapshotId:'',revision:0,updatedAt:null,data:null};
    const latest=files[0];
    const loaded=await readStarbucksSnapshot(latest);
    // Track the immutable ancestry. Parallel uploads from the same base are forks,
    // not replacements; never auto-pull over a fork that lacks our latest file.
    const byId=new Map(files.map(file=>[String(file.id),file]));
    const ancestors=[];
    const seen=new Set([String(latest.id)]);
    let cursor=String(latest.appProperties?.base_id||'');
    while(cursor&&cursor!=='root'&&byId.has(cursor)&&!seen.has(cursor)){
      ancestors.push(cursor);seen.add(cursor);
      cursor=String(byId.get(cursor).appProperties?.base_id||'');
    }
    return {ownerId,exists:true,snapshotId:String(latest.id),revision:Number(latest.version||1),
      updatedAt:latest.createdTime||latest.modifiedTime||null,data:loaded.data,
      baseId:loaded.baseId,fileName:latest.name,ancestorIds:ancestors};
  }
  async function saveStarbucksSnapshot(data,expectedFileId='') {
    const {normalizeData}=await import('../starbucks-insights/driveSync.js');
    const normalized=normalizeData(data);
    const json=JSON.stringify({kind:'duynguyen-starbucks-snapshot-v1',savedAt:new Date(now()).toISOString(),
      baseId:expectedFileId||'',data:normalized});
    if(new Blob([json]).size>4*1024*1024)
      throw new Error('Bản JSON Starbucks lớn hơn 4 MB; hãy xuất file JSON trước khi đồng bộ.');
    // Check the previous head before adding a new immutable snapshot.
    const snapshots=await listStarbucksSnapshots();
    if(String(snapshots[0]?.id||'')!==String(expectedFileId||'')){
      const error=new Error('Drive đã có dữ liệu mới từ một thiết bị khác. Không ghi đè; hãy xử lý xung đột.');
      error.code='STARBUCKS_CONFLICT';error.status=409;throw error;
    }
    const stamp=new Date(now()).toISOString().replace(/[:.]/g,'-');
    const uuid=crypto.randomUUID();
    const metadata={
      name:'DuyNguyen-Starbucks-'+stamp+'-'+uuid.slice(0,8)+'.json',
      mimeType:'application/json',
      description:'Duy Nguyen · Starbucks Rewards & Insights · Private backup',
      appProperties:{[STARBUCKS_TAG]:STARBUCKS_VALUE,base_id:String(expectedFileId||'root')}
    };
    const boundary='dn_starbucks_'+uuid.replace(/-/g,'');
    const body=new Blob([
      '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      json,'\r\n--'+boundary+'--\r\n'
    ]);
    const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields='+encodeURIComponent(STARBUCKS_FIELDS),{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
    });
    const file=await response.json();
    if(!file?.id)throw new Error('Google Drive không trả ID file sau khi lưu. Kiểm tra Drive trước khi thử lại.');
    // A read-back is stronger evidence than a successful POST alone.
    const stored=await readStarbucksSnapshot(file);
    if(JSON.stringify(stored.data)!==JSON.stringify(normalized))
      throw new Error('Nội dung Drive khác bản gửi. Không xác nhận đồng bộ.');
    return {ownerId:await driveIdentity(),exists:true,snapshotId:String(file.id),
      revision:Number(file.version||1),updatedAt:file.createdTime||file.modifiedTime||new Date(now()).toISOString(),
      data:stored.data,fileName:file.name};
  }
  // Highlands backups are isolated from personal expenses by their appProperties.
  const HIGHLANDS_TAG='dn_highlands';
  const HIGHLANDS_VALUE='snapshot_v1';
  const HIGHLANDS_FIELDS='id,name,mimeType,createdTime,modifiedTime,version,appProperties';
  async function listHighlandsSnapshots() {
    let token='',files=[],pages=0;
    do {
      const params=new URLSearchParams({
        q:"trashed = false and appProperties has { key = 'dn_highlands' and value = 'snapshot_v1' }",
        fields:'nextPageToken,files('+HIGHLANDS_FIELDS+')',
        orderBy:'createdTime desc',pageSize:'100'
      });
      if(token)params.set('pageToken',token);
      const body=await (await request(API+'?'+params)).json();
      files.push(...(body.files||[]).filter(file=>file.appProperties?.[HIGHLANDS_TAG]===HIGHLANDS_VALUE));
      token=body.nextPageToken||'';
      if(++pages>100)throw new Error('Quá nhiều trang snapshot Google Drive, cần kiểm tra và dọn lịch sử.');
    }while(token);
    return files.sort((a,b)=>String(b.createdTime||b.modifiedTime||'').localeCompare(String(a.createdTime||a.modifiedTime||''))||
      String(b.id).localeCompare(String(a.id)));
  }
  async function readHighlandsSnapshot(file) {
    if(!file?.id)throw new Error('Snapshot Drive không có ID.');
    const res=await request(API+'/'+encodeURIComponent(file.id)+'?alt=media');
    let envelope;
    try{envelope=JSON.parse(await res.text());}
    catch{throw new Error('File sao lưu Highlands trên Drive không phải JSON hợp lệ. Không tự ghi đè.');}
    if(envelope?.kind!=='duynguyen-highlands-snapshot-v1'||!envelope.data)
      throw new Error('File Drive không đúng định dạng sao lưu Highlands. Không tự ghi đè.');
    let data;
    try {data=(await import('../highlands-insights/driveSync.js')).normalizeData(envelope.data);}
    catch(error) {throw new Error('Dữ liệu JSON Drive không hợp lệ: '+error.message);}
    return {data,baseId:String(envelope.baseId||''),file};
  }
  async function readHighlandsState() {
    const ownerId=await driveIdentity();
    const files=await listHighlandsSnapshots();
    if(!files.length)return {ownerId,exists:false,snapshotId:'',revision:0,updatedAt:null,data:null};
    const latest=files[0];
    const loaded=await readHighlandsSnapshot(latest);
    // Track the immutable ancestry. Parallel uploads from the same base are forks,
    // not replacements; never auto-pull over a fork that lacks our latest file.
    const byId=new Map(files.map(file=>[String(file.id),file]));
    const ancestors=[];
    const seen=new Set([String(latest.id)]);
    let cursor=String(latest.appProperties?.base_id||'');
    while(cursor&&cursor!=='root'&&byId.has(cursor)&&!seen.has(cursor)){
      ancestors.push(cursor);seen.add(cursor);
      cursor=String(byId.get(cursor).appProperties?.base_id||'');
    }
    return {ownerId,exists:true,snapshotId:String(latest.id),revision:Number(latest.version||1),
      updatedAt:latest.createdTime||latest.modifiedTime||null,data:loaded.data,
      baseId:loaded.baseId,fileName:latest.name,ancestorIds:ancestors};
  }
  async function saveHighlandsSnapshot(data,expectedFileId='') {
    const {normalizeData}=await import('../highlands-insights/driveSync.js');
    const normalized=normalizeData(data);
    const json=JSON.stringify({kind:'duynguyen-highlands-snapshot-v1',savedAt:new Date(now()).toISOString(),
      baseId:expectedFileId||'',data:normalized});
    if(new Blob([json]).size>4*1024*1024)
      throw new Error('Bản JSON Highlands lớn hơn 4 MB; hãy xuất file JSON trước khi đồng bộ.');
    // Check the previous head before adding a new immutable snapshot.
    const snapshots=await listHighlandsSnapshots();
    if(String(snapshots[0]?.id||'')!==String(expectedFileId||'')){
      const error=new Error('Drive đã có dữ liệu mới từ một thiết bị khác. Không ghi đè; hãy xử lý xung đột.');
      error.code='HIGHLANDS_CONFLICT';error.status=409;throw error;
    }
    const stamp=new Date(now()).toISOString().replace(/[:.]/g,'-');
    const uuid=crypto.randomUUID();
    const metadata={
      name:'DuyNguyen-Highlands-'+stamp+'-'+uuid.slice(0,8)+'.json',
      mimeType:'application/json',
      description:'Duy Nguyen · Highlands Rewards & Insights · Private backup',
      appProperties:{[HIGHLANDS_TAG]:HIGHLANDS_VALUE,base_id:String(expectedFileId||'root')}
    };
    const boundary='dn_highlands_'+uuid.replace(/-/g,'');
    const body=new Blob([
      '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      json,'\r\n--'+boundary+'--\r\n'
    ]);
    const response=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields='+encodeURIComponent(HIGHLANDS_FIELDS),{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
    });
    const file=await response.json();
    if(!file?.id)throw new Error('Google Drive không trả ID file sau khi lưu. Kiểm tra Drive trước khi thử lại.');
    // A read-back is stronger evidence than a successful POST alone.
    const stored=await readHighlandsSnapshot(file);
    if(JSON.stringify(stored.data)!==JSON.stringify(normalized))
      throw new Error('Nội dung Drive khác bản gửi. Không xác nhận đồng bộ.');
    return {ownerId:await driveIdentity(),exists:true,snapshotId:String(file.id),
      revision:Number(file.version||1),updatedAt:file.createdTime||file.modifiedTime||new Date(now()).toISOString(),
      data:stored.data,fileName:file.name};
  }
  // Payroll backups are AES-GCM ciphertext ONLY. No plaintext salary data, PDF
  // bytes, file name or employee data appear in Drive metadata.
  const PAYROLL_TAG='dn_payroll';
  const PAYROLL_VALUE='encrypted_snapshot_v1';
  const PAYROLL_FIELDS='id,name,mimeType,createdTime,modifiedTime,version,appProperties';
  async function listPayrollSnapshots(){
    let cursor='',files=[],pages=0;
    do{
      const params=new URLSearchParams({
        q:"trashed = false and appProperties has { key = 'dn_payroll' and value = 'encrypted_snapshot_v1' }",
        fields:'nextPageToken,files('+PAYROLL_FIELDS+')',orderBy:'createdTime desc',pageSize:'100'
      });
      if(cursor)params.set('pageToken',cursor);
      const response=await (await request(API+'?'+params)).json();
      files.push(...(response.files||[]).filter(file=>file.appProperties?.[PAYROLL_TAG]===PAYROLL_VALUE));
      cursor=response.nextPageToken||'';
      if(++pages>100)throw new Error('Quá nhiều bản sao Payroll trên Drive.');
    }while(cursor);
    return files.sort((a,b)=>String(b.createdTime||b.modifiedTime||'').localeCompare(String(a.createdTime||a.modifiedTime||''))||String(b.id).localeCompare(String(a.id)));
  }
  async function readPayrollEncryptedSnapshot(file){
    if(!file?.id)throw new Error('Snapshot Payroll thiếu ID.');
    const response=await request(API+'/'+encodeURIComponent(file.id)+'?alt=media');
    let data;
    try{data=JSON.parse(await response.text());}
    catch{throw new Error('Backup Payroll trên Drive không phải JSON hợp lệ.');}
    if(data?.kind!=='duynguyen-payroll-encrypted-v1'||typeof data.ciphertext!=='string'||
      typeof data.salt!=='string'||typeof data.iv!=='string'){
      throw new Error('Backup Payroll không đúng định dạng mã hóa; không phục hồi dữ liệu lạ.');
    }
    return {data,file,baseId:String(data.baseId||'')};
  }
  async function readPayrollState(){
    const ownerId=await driveIdentity();
    const files=await listPayrollSnapshots();
    if(!files.length)return {ownerId,exists:false,snapshotId:'',updatedAt:null,data:null};
    const current=files[0],loaded=await readPayrollEncryptedSnapshot(current);
    return {ownerId,exists:true,snapshotId:String(current.id),
      updatedAt:current.createdTime||current.modifiedTime||null,data:loaded.data,
      baseId:loaded.baseId,revision:Number(current.version||1)};
  }
  async function savePayrollEncryptedSnapshot(encrypted,expectedFileId=''){
    if(encrypted?.kind!=='duynguyen-payroll-encrypted-v1'||typeof encrypted.ciphertext!=='string'||
      typeof encrypted.salt!=='string'||typeof encrypted.iv!=='string')
      throw new Error('Chỉ được upload snapshot Payroll đã mã hóa.');
    const checked=await listPayrollSnapshots();
    if(String(checked[0]?.id||'')!==String(expectedFileId||'')){
      const error=new Error('Có bản sao Payroll mới trên Drive. Chưa đồng bộ để tránh ghi đè xung đột.');
      error.status=409;error.code='PAYROLL_CONFLICT';throw error;
    }
    const record={...encrypted,baseId:expectedFileId||''};
    const json=JSON.stringify(record);
    if(new Blob([json]).size>4*1024*1024)
      throw new Error('Bản sao Payroll đã mã hóa quá 4 MB; giảm số dòng trước khi đồng bộ.');
    const uuid=crypto.randomUUID();
    const name='DuyNguyen-Payroll-Encrypted-'+new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+uuid.slice(0,8)+'.json';
    const metadata={name,mimeType:'application/json',
      description:'Encrypted Payroll & C&B backup · only owner passphrase can decrypt',
      appProperties:{[PAYROLL_TAG]:PAYROLL_VALUE,base_id:String(expectedFileId||'root')}};
    const boundary='dn_payroll_'+uuid.replace(/-/g,'');
    const body=new Blob([
      '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      json,'\r\n--'+boundary+'--\r\n'
    ]);
    const result=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields='+encodeURIComponent(PAYROLL_FIELDS),{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
    });
    const file=await result.json();
    if(!file?.id)throw new Error('Không có ID bản sao Payroll trên Drive.');
    const readback=await readPayrollEncryptedSnapshot(file);
    if(JSON.stringify(readback.data)!==JSON.stringify(record))
      throw new Error('Nội dung backup Payroll đọc lại khác bản đã upload.');
    return {ownerId:await driveIdentity(),exists:true,snapshotId:String(file.id),
      updatedAt:file.createdTime||file.modifiedTime||new Date(now()).toISOString(),
      data:readback.data};
  }


  const POST_BACKUP_TAG='dn_editor_post_backup';
  const POST_BACKUP_VALUE='v1';
  const POST_BACKUP_FIELDS='id,name,createdTime,modifiedTime,appProperties,webViewLink';
  async function listPostBackups(blogId){
    let cursor='',files=[],pages=0;
    do{
      const query="trashed = false and appProperties has { key = '"+POST_BACKUP_TAG+"' and value = '"+POST_BACKUP_VALUE+"' }";
      const params=new URLSearchParams({q:query,fields:'nextPageToken,files('+POST_BACKUP_FIELDS+')',pageSize:'100',orderBy:'createdTime desc'});
      if(cursor)params.set('pageToken',cursor);
      const body=await (await request(API+'?'+params)).json();
      files.push(...(body.files||[]).filter(f=>f.appProperties?.[POST_BACKUP_TAG]===POST_BACKUP_VALUE&&String(f.appProperties?.blog_id)===String(blogId)));
      cursor=body.nextPageToken||'';
      if(++pages>100)throw new Error('Quá nhiều trang sao lưu bài viết.');
    }while(cursor);
    return files;
  }
  async function readPostBackup(fileId){
    const response=await request(API+'/'+encodeURIComponent(fileId)+'?alt=media');
    const data=await response.json();
    if(data?.kind!=='duynguyen-editor-post-backup-v1'||!data.post||
      !/^\\d+$/.test(String(data.blogId||''))||!/^\\d+$/.test(String(data.post.id||''))||
      typeof data.post.content!=='string')throw new Error('Bản sao lưu không đúng định dạng bài Blogger.');
    return data;
  }
  async function savePostBackup(blogId,post,reason='manual'){
    if(!/^\\d+$/.test(String(blogId))||!/^\\d+$/.test(String(post?.id||''))||typeof post?.content!=='string')
      throw new Error('Bài Blogger không hợp lệ; không thể sao lưu.');
    const record={kind:'duynguyen-editor-post-backup-v1',blogId:String(blogId),reason,
      savedAt:new Date(now()).toISOString(),post:{
       id:String(post.id),title:String(post.title||''),content:post.content,
       labels:Array.isArray(post.labels)?post.labels:[],status:String(post.status||''),
       updated:String(post.updated||''),published:String(post.published||''),url:String(post.url||'')
      }};
    const content=JSON.stringify(record);
    if(new Blob([content]).size>5*1024*1024)throw new Error('Bài quá 5 MB, chưa thể sao lưu an toàn.');
    const uuid=crypto.randomUUID(),boundary='editorpost_'+uuid.replace(/-/g,'');
    const metadata={name:'Blogger-post-'+post.id+'-'+new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+uuid.slice(0,8)+'.json',
      mimeType:'application/json',description:'Duy Nguyen Editor · Blogger post immutable backup',
      appProperties:{[POST_BACKUP_TAG]:POST_BACKUP_VALUE,blog_id:String(blogId),post_id:String(post.id),reason}};
    const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      content,'\r\n--'+boundary+'--\r\n']);
    const res=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields='+encodeURIComponent(POST_BACKUP_FIELDS),{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    const file=await res.json();
    if(!file?.id)throw new Error('Drive không xác nhận ID bản sao lưu. Không thể xóa bài.');
    const verified=await readPostBackup(file.id);
    if(JSON.stringify(verified)!==content)throw new Error('Nội dung đọc lại từ Drive khác bản sao lưu. Không được xóa bài.');
    return file;
  }

  // Cashflow extends the shared in-memory OAuth client; never expose its token.
  const cashflowRequest=(url,options)=>{
    const u=new URL(url);
    if(u.protocol!=='https:'||!['www.googleapis.com','sheets.googleapis.com'].includes(u.hostname))throw new Error('Google endpoint không hợp lệ');
    return request(url,options);
  };
  return {login, disconnect, connected, cashflowRequest, listPostBackups, readPostBackup, savePostBackup, listBlogPosts, readMarkdown, saveMarkdownToDrive,
    driveIdentity,listExpenseSnapshots,readExpenseSnapshot,readExpenseState,saveExpenseSnapshot,
    listStarbucksSnapshots,readStarbucksSnapshot,readStarbucksState,saveStarbucksSnapshot,
    listHighlandsSnapshots,readHighlandsSnapshot,readHighlandsState,saveHighlandsSnapshot,
    listPayrollSnapshots,readPayrollEncryptedSnapshot,readPayrollState,savePayrollEncryptedSnapshot};

}
export const googleDrive = createDriveService();

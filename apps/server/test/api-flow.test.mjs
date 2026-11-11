import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {Readable,Writable} from 'node:stream';
import {createApp} from '../index.mjs';
const PORT_ORIGIN='http://localhost:5173';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});

// Exercise the HTTP handler with real streams, without binding a local port.
function requestApp(server,href,options={}){
  return new Promise((resolve,reject)=>{
    const url=new URL(href),chunks=[],headers=new Headers();
    const req=Readable.from(options.body?[Buffer.from(options.body)]:[]);
    Object.assign(req,{method:options.method||'GET',url:url.pathname+url.search,headers:Object.fromEntries(new Headers(options.headers))});
    const res=new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
    res.statusCode=200;
    res.setHeader=(name,value)=>headers.set(name,value);
    res.writeHead=(status,extra={})=>{res.statusCode=status;res.headersSent=true;for(const [name,value] of Object.entries(extra))res.setHeader(name,value);return res;};
    res.on('error',reject);
    res.on('finish',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers})));
    server.emit('request',req,res);
  });
}

test('OAuth state + Blogger lists, pagination, diagnostics and draft create/patch, without real Google calls',async(t)=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'duy-editor-test-'));
  const post={id:'123',title:'Bài kiểm tra',content:'<p>text</p>',labels:['Test'],status:'DRAFT',updated:'2026-11-06T12:00:00Z'};
  const listRequests=[];
  const fakeGoogle=async (url,opt={})=>{
    const href=String(url);
    if(href.includes('oauth2.googleapis.com/token'))return response({access_token:'TEST_ACCESS',refresh_token:'TEST_REFRESH',expires_in:3600});
    if(href.includes('/users/self/blogs')){
      const endpoint=new URL(href);
      const supported=new Set(['view','fetchUserInfo']);
      if([...endpoint.searchParams.keys()].some(key=>!supported.has(key)))
        return response({error:{message:'Request contains an invalid argument.'}},400);
      if(endpoint.searchParams.has('view'))
        return response({error:{message:'Request contains an invalid argument.',status:'INVALID_ARGUMENT'}},400);
      return response({items:[{id:'1346670730934460908',name:'Duy Nguyen',url:'https://duynguyen99.blogspot.com'}]});
    }
    if(href.includes('/posts/123/publish')){post.status='LIVE';post.updated='2026-11-06T12:00:03Z';return response(post);}
    if(href.includes('/posts/123')&&opt.method==='GET')return response(post);
    if(href.includes('/posts/123')&&opt.method==='PATCH'){Object.assign(post,JSON.parse(opt.body),{updated:'2026-11-06T12:00:02Z'});return response(post);}
    if(href.includes('/posts?isDraft=true')&&opt.method==='POST'){Object.assign(post,JSON.parse(opt.body));return response(post);}
    if(href.includes('/posts?')&&opt.method==='GET'){
      const endpoint=new URL(href);
      const params=endpoint.searchParams;
      // Match the enum values in Google's current Blogger v3 discovery schema.
      if(!['DRAFT','LIVE'].includes(params.get('status'))||params.get('orderBy')!=='UPDATED')
        return response({error:{message:'Request contains an invalid argument.',status:'INVALID_ARGUMENT'}},400);
      assert.equal(params.get('view'),'ADMIN');
      if(params.get('fetchBodies')==='true'){
        assert.equal(params.get('maxResults'),'100');
        return response({items:[{...post,status:params.get('status')}],nextPageToken:undefined});
      }
      assert.equal(params.get('fetchBodies'),'false');
      assert.equal(params.get('maxResults'),'30');
      if(params.get('pageToken')==='PRIVATE_PAGE_TOKEN')
        return response({error:{message:'Request contains an invalid argument.',status:'INVALID_ARGUMENT'}},400);
      listRequests.push(Object.fromEntries(params));
      return response({items:[{...post,status:params.get('status')}],nextPageToken:params.has('pageToken')?undefined:'next+/=page'});
    }
    return response({error:{message:'Unexpected mock endpoint '+href}},404);
  };
  const server=createApp({clientId:'client-id',clientSecret:'client-secret',redirect:'http://localhost:3000/auth/google/callback',frontend:PORT_ORIGIN,host:'localhost',port:3000,blogId:'1346670730934460908',secret:'f'.repeat(64),secure:false},fakeGoogle,path.join(folder,'sessions.enc'));
  const base='http://localhost:3000';
  const fetch=(href,options)=>requestApp(server,href,options);
  try{
    const health=await fetch(base+'/api/health');
    assert.equal((await health.json()).revision,'blog-list-default-view-2026-11-06');
    const initial=await fetch(base+'/api/status');const sid=initial.headers.get('set-cookie').split(';')[0];
    assert.equal((await initial.json()).connected,false);
    const auth=await fetch(base+'/auth/google/start',{redirect:'manual',headers:{cookie:sid}});
    const url=new URL(auth.headers.get('location'));
    assert.equal(url.searchParams.get('scope'),'https://www.googleapis.com/auth/blogger');
    assert.equal(url.searchParams.get('code_challenge_method'),'S256');
    const state=url.searchParams.get('state');
    const invalid=await fetch(base+'/auth/google/callback?state=wrong&code=test',{headers:{cookie:sid}});
    assert.equal(invalid.status,400);
    const cb=await fetch(base+'/auth/google/callback?state='+encodeURIComponent(state)+'&code=test',{headers:{cookie:sid},redirect:'manual'});
    assert.equal(cb.status,302);const newCookie=cb.headers.get('set-cookie').split(';')[0];
    const connected=await fetch(base+'/api/status',{headers:{cookie:newCookie}});const info=await connected.json();assert.equal(info.connected,true);
    const getBlogs=await fetch(base+'/api/blogs',{headers:{cookie:newCookie}});assert.equal((await getBlogs.json()).blogs.length,1);
    for(const filter of ['draft','live']){
      const listed=await fetch(base+'/api/posts?blogId=1346670730934460908&status='+filter,{headers:{cookie:newCookie}});
      assert.equal(listed.status,200);
      const result=await listed.json();
      assert.equal(result.posts[0].status,filter.toUpperCase());
      assert.equal(Object.hasOwn(result.posts[0],'content'),false);
      assert.equal(result.nextPageToken,'next+/=page');
    }
    const paged=await fetch(base+'/api/posts?'+new URLSearchParams({blogId:'1346670730934460908',pageToken:'next+/=page'}),{headers:{cookie:newCookie}});
    assert.equal(paged.status,200);
    assert.equal((await paged.json()).nextPageToken,null);
    assert.equal(listRequests.at(-1).pageToken,'next+/=page');
    const invalidFilter=await fetch(base+'/api/posts?blogId=1346670730934460908&status=invalid',{headers:{cookie:newCookie}});
    assert.equal(invalidFilter.status,400);
    assert.equal(listRequests.length,3);
    const logger=t.mock.method(console,'error',()=>{});
    const failedList=await fetch(base+'/api/posts?'+new URLSearchParams({blogId:'1346670730934460908',pageToken:'PRIVATE_PAGE_TOKEN'}),{headers:{cookie:newCookie}});
    assert.equal(failedList.status,502);
    assert.match((await failedList.json()).error,/GET \/blogs\/1346670730934460908\/posts, HTTP 400/);
    assert.equal(logger.mock.callCount(),1);
    const diagnostic=logger.mock.calls[0].arguments.at(-1);
    assert.equal(diagnostic.httpStatus,400);
    assert.equal(diagnostic.code,'INVALID_ARGUMENT');
    assert.deepEqual(diagnostic.parameters,{status:'DRAFT',view:'ADMIN',fetchBodies:'false',orderBy:'UPDATED',maxResults:'30'});
    assert.doesNotMatch(JSON.stringify(logger.mock.calls),/TEST_ACCESS|TEST_REFRESH|PRIVATE_PAGE_TOKEN/);
    logger.mock.restore();
    const seriesValue={name:'Series CI/CD',part:2,total_parts:8,target_date:'2026-12-01',status:'in_progress'};
    const seriesMarker='<aside hidden="hidden" class="dn-series-metadata" data-kind="series-metadata" data-series="'+encodeURIComponent(JSON.stringify(seriesValue))+'"></aside>';
    const input={blogId:'1346670730934460908',title:'Bài kiểm tra',content:seriesMarker+'<p>text</p><script>alert(1)</script>',labels:['Test']};
    const draft=await fetch(base+'/api/drafts',{method:'POST',headers:{cookie:newCookie,'Content-Type':'application/json',origin:PORT_ORIGIN,'X-CSRF-Token':info.csrf},body:JSON.stringify(input)});
    assert.equal(draft.status,201);const created=(await draft.json()).post;assert.ok(!created.content.includes('<script>'));
    assert.match(created.content,/data-kind="series-metadata"/);
    assert.match(created.content,/data-series="/);
    assert.match(created.content,/hidden="hidden"/);
    const listedSeries=await fetch(base+'/api/series?'+new URLSearchParams({blogId:'1346670730934460908',name:'Series CI/CD'}),{headers:{cookie:newCookie}});
    assert.equal(listedSeries.status,200);
    const indexed=await listedSeries.json();
    assert.equal(indexed.posts.length,2);
    assert.equal(indexed.partial,false);
    assert.equal(indexed.nextDraftToken,'done');
    assert.equal(indexed.nextLiveToken,'done');
    assert.deepEqual(indexed.posts.map(entry=>entry.series.part),[2,2]);
    assert.ok(indexed.posts.every(entry=>!Object.hasOwn(entry,'content')));
    const invalidSeries=await fetch(base+'/api/series?blogId=1346670730934460908&name=',{headers:{cookie:newCookie}});
    assert.equal(invalidSeries.status,400);
    const forbidden=await fetch(base+'/api/drafts/123',{method:'PATCH',headers:{cookie:newCookie,'Content-Type':'application/json',origin:PORT_ORIGIN,'X-CSRF-Token':info.csrf},body:JSON.stringify({...input,expectedUpdated:'wrong'})});assert.equal(forbidden.status,409);
    const updated=await fetch(base+'/api/drafts/123',{method:'PATCH',headers:{cookie:newCookie,'Content-Type':'application/json',origin:PORT_ORIGIN,'X-CSRF-Token':info.csrf},body:JSON.stringify({...input,expectedUpdated:created.updated})});assert.equal(updated.status,200);
    const noCsrf=await fetch(base+'/api/drafts',{method:'POST',headers:{cookie:newCookie,'Content-Type':'application/json',origin:PORT_ORIGIN},body:JSON.stringify(input)});assert.equal(noCsrf.status,403);
    assert.ok(fs.readFileSync(path.join(folder,'sessions.enc'),'utf8').length>20);
    assert.ok(!fs.readFileSync(path.join(folder,'sessions.enc'),'utf8').includes('TEST_REFRESH'));
  }finally{server.close();fs.rmSync(folder,{recursive:true,force:true});}
});

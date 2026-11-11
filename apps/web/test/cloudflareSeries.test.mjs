import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/[[path]].js';
import {withSeriesHTML} from '../src/services/series.js';

const base='https://editor.example';
const env={
  GOOGLE_CLIENT_ID:'test-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET:'fake-only',
  GOOGLE_REDIRECT_URI:base+'/auth/google/callback',
  FRONTEND_ORIGIN:base,
  APP_SECRET:'a'.repeat(64),
  BLOGGER_BLOG_ID:'123456789'
};
const makeJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const series={enabled:true,name:'Từng bước CI/CD',part:2,total_parts:8,target_date:'2026-12-31'};

test('Cloudflare Pages Series endpoint authenticates, paginates and preserves metadata',async t=>{
  const calls=[];
  const mocked=t.mock.method(globalThis,'fetch',async(url,options={})=>{
    const u=new URL(String(url));
    calls.push({pathname:u.pathname,method:options.method,status:u.searchParams.get('status'),token:u.searchParams.get('pageToken')});
    if(u.hostname==='oauth2.googleapis.com')
      return makeJson({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});
    if(u.pathname==='/blogger/v3/blogs/123456789/posts'&&options.method==='GET'){
      assert.equal(u.searchParams.get('fetchBodies'),'true');
      assert.equal(u.searchParams.get('maxResults'),'100');
      const status=u.searchParams.get('status'),token=u.searchParams.get('pageToken');
      if(status==='DRAFT'&&!token)return makeJson({items:[{id:'42',title:'Tập 2',content:withSeriesHTML('<p>Nội dung</p>',series),status:'DRAFT'}],nextPageToken:'draft-more'});
      if(status==='LIVE'&&!token)return makeJson({items:[],nextPageToken:'live-more'});
      if(status==='DRAFT'&&token==='draft-more')return makeJson({items:[]});
      if(status==='LIVE'&&token==='live-more')return makeJson({items:[{id:'40',title:'Tập 1',url:'https://blog.example/tap-1',content:withSeriesHTML('<p>Hi</p>',{...series,part:1}),status:'LIVE'}]});
    }
    if(u.pathname==='/blogger/v3/blogs/123456789/posts'&&options.method==='POST'){
      const post=JSON.parse(options.body);
      return makeJson({...post,id:'99',status:'DRAFT',updated:'2026-11-07T00:00:00Z'});
    }
    return makeJson({error:{message:'Unexpected mock URL '+String(url)}},404);
  });
  const call=(pathname,cookie='',options={})=>onRequest({
    request:new Request(base+pathname,{...options,headers:{...(cookie?{Cookie:cookie}:{}),...(options.headers||{})}}),
    env
  });
  try{
    const status=await call('/api/status');
    assert.equal(status.status,200);
    const firstCookie=status.headers.get('set-cookie').split(';')[0];
    const start=await call('/auth/google/start',firstCookie);
    assert.equal(start.status,302);
    const authUrl=new URL(start.headers.get('location'));
    const startCookie=start.headers.get('set-cookie').split(';')[0];
    const callback=await call('/auth/google/callback?state='+encodeURIComponent(authUrl.searchParams.get('state'))+'&code=test',startCookie);
    assert.equal(callback.status,302);
    const authCookie=callback.headers.get('set-cookie').split(';')[0];

    const query='blogId=123456789&name='+encodeURIComponent(series.name);
    const first=await call('/api/series?'+query,authCookie);
    assert.equal(first.status,200);
    const page1=await first.json();
    assert.equal(page1.partial,true);
    assert.equal(page1.nextDraftToken,'draft-more');
    assert.equal(page1.nextLiveToken,'live-more');
    assert.equal(page1.posts.length,1);
    assert.equal(page1.posts[0].series.part,2);
    assert.equal(page1.posts[0].content,undefined);
    const second=await call('/api/series?'+query+'&draftToken=draft-more&liveToken=live-more',authCookie);
    assert.equal(second.status,200);
    const page2=await second.json();
    assert.equal(page2.partial,false);
    assert.equal(page2.posts[0].series.part,1);
    assert.equal(page2.nextDraftToken,'done');
    assert.equal(page2.nextLiveToken,'done');

    const connectedStatus=await call('/api/status',authCookie);
    const csrf=(await connectedStatus.json()).csrf;
    const draft=await call('/api/drafts',authCookie,{method:'POST',headers:{Origin:base,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({blogId:'123456789',title:'Test series',labels:[],content:withSeriesHTML('<p>Hi</p><script>alert(1)</script>',series)})});
    assert.equal(draft.status,201);
    const created=(await draft.json()).post;
    assert.match(created.content,/data-series="/);
    assert.match(created.content,/hidden="hidden"/);
    assert.doesNotMatch(created.content,/<script/);
    assert.equal(mocked.mock.callCount(),6);
  }finally{mocked.mock.restore();}
});

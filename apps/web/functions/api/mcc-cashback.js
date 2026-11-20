import {readMccDatabase} from '../../src/mcc-cashback/sheet.mjs';
export async function onRequestGet({env}) {
  try {
    const result=await readMccDatabase(env);
    return Response.json(result,{headers:{'cache-control':'public, max-age=60, stale-while-revalidate=120',
      'x-content-type-options':'nosniff'}});
  } catch(error) {
    return Response.json({error:String(error.message||error).slice(0,220),
      source:'unavailable'}, {status:error.status||502,headers:{'cache-control':'no-store'}});
  }
}

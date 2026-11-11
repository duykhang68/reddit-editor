export async function api(path, {method='GET',body,csrf}={}) {
  let r;
  try {
    r=await fetch('/api'+path,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},body:body?JSON.stringify(body):undefined});
  }catch{throw new Error('Không kết nối được backend. Kiểm tra npm run dev và Internet.');}
  const data=await r.json().catch(()=>({error:'Phản hồi không phải JSON'}));
  if(!r.ok){const e=new Error(data.error||`HTTP ${r.status}`);e.status=r.status;throw e;}
  return data;
}

import {MAX_PDF_BYTES,MAX_PDF_PAGES} from './model.js';
// Version-pinned PDF.js/Tesseract runtimes; PDFs are parsed locally, never POSTed.
const PDFJS='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const TESSERACT='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
const libs=new Map();
function script(src,globalName){
 if(globalThis[globalName])return Promise.resolve(globalThis[globalName]);
 if(!libs.has(src))libs.set(src,new Promise((resolve,reject)=>{
  const tag=document.createElement('script');
  tag.src=src;tag.crossOrigin='anonymous';tag.async=true;
  tag.onload=()=>globalThis[globalName]?resolve(globalThis[globalName]):reject(new Error('Không khởi tạo được '+globalName));
  tag.onerror=()=>reject(new Error('Không tải được thư viện phân tích PDF/OCR. Kiểm tra kết nối mạng.'));
  document.head.appendChild(tag);
 }).catch(err=>{libs.delete(src);throw err;}));
 return libs.get(src);
}
function textLines(text,page){
 return String(text??'').split(/\r?\n/).map(text=>text.trim()).filter(Boolean).map(text=>({text,page}));
}
export function layoutTextItems(items,page){
 const ordered=(Array.isArray(items)?items:[]).filter(i=>String(i.str||'').trim()).map(i=>({
  x:Number(i.transform?.[4]||0),y:Number(i.transform?.[5]||0),
  width:Number(i.width||0),text:String(i.str||'').trim(),hasEOL:Boolean(i.hasEOL)
 })).sort((a,b)=>b.y-a.y||a.x-b.x);
 const groups=[];
 for(const item of ordered){
  let line=groups.find(g=>Math.abs(g.y-item.y)<=3);
  if(!line){line={y:item.y,items:[]};groups.push(line);}
  line.items.push(item);
 }
 return groups.sort((a,b)=>b.y-a.y).map(line=>{
  const members=line.items.sort((a,b)=>a.x-b.x);
  let output='',lastEnd=null;
  for(const item of members){
   const delta=lastEnd===null?0:item.x-lastEnd;
   output+=(output?(delta>16?'   ':' '):'')+item.text;
   lastEnd=item.x+item.width;
  }
  return {text:output.replace(/\s+/g,' ').trim(),page};
 }).filter(x=>x.text);
}
async function runScannedPage(doc,index,onStatus){
 const lib=await script(TESSERACT,'Tesseract');
 const page=await doc.getPage(index);
 const viewport=page.getViewport({scale:1.65});
 const max=2400,scale=Math.min(1,max/Math.max(viewport.width,viewport.height));
 const view=scale===1?viewport:page.getViewport({scale:1.65*scale});
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
 const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context)throw new Error('Không tạo được vùng OCR PDF.');
 await page.render({canvasContext:context,viewport:view}).promise;
 onStatus('Trang '+index+': đang OCR văn bản tiếng Việt/Anh trên ảnh quét');
 let worker;
 try{
  worker=await lib.createWorker(['vie','eng'],1);
  const result=await worker.recognize(canvas);
  return textLines(result.data.text,index);
 }finally{if(worker)await worker.terminate();canvas.width=0;canvas.height=0;page.cleanup();}
}
export async function extractPayslipPdf(file,onProgress=()=>{}){
 if(file?.type!=='application/pdf'&&!/\.pdf$/i.test(file?.name||''))throw new Error('Chọn đúng tệp PDF bảng lương.');
 if(!file?.size||file.size>MAX_PDF_BYTES)throw new Error('PDF tối đa 15 MB.');
 const pdfjs=await script(PDFJS,'pdfjsLib');
 pdfjs.GlobalWorkerOptions.workerSrc=PDF_WORKER;
 const bytes=new Uint8Array(await file.arrayBuffer());
 const task=pdfjs.getDocument({data:bytes,isEvalSupported:false});
 const document=await task.promise,lines=[],scanned=[],pages=document.numPages;
 try{
  if(pages>MAX_PDF_PAGES)throw new Error('Giới hạn '+MAX_PDF_PAGES+' trang PDF mỗi lần import.');
  for(let i=1;i<=pages;i++){
   onProgress({page:i,pages,message:'Đang trích xuất văn bản trang '+i+'/'+pages});
   const page=await document.getPage(i);
   const content=await page.getTextContent();
   const layout=layoutTextItems(content.items,i);
   if(layout.reduce((sum,r)=>sum+r.text.length,0)<25){
    scanned.push(i);
    try{lines.push(...await runScannedPage(document,i,message=>onProgress({page:i,pages,message})));}
    catch(error){lines.push({text:'[Trang '+i+' là ảnh quét; OCR thất bại: '+error.message+']',page:i});}
   }else lines.push(...layout);
   page.cleanup();
  }
  return {lines,pages,scannedPages:scanned,extraction:'local-only'};
 }finally{await document.destroy();}
}

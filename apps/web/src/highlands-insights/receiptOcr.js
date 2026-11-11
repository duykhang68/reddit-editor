import {calculatePayable,validDate} from './model.js';

// Parser riêng cho hóa đơn nhiệt Highlands (không dùng các nhãn Starbucks Rewards).
// Chỉ lấy số tiền trong vùng món hàng / nhãn thanh toán, không nhầm mã QR, số điện thoại, máy POS.
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const ascii=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/đ/gi,'d').toLowerCase();
// Hóa đơn nhiệt thường bị OCR tách/thay ký tự trong logo; chỉ dùng logo như
// một tín hiệu, không phải điều kiện bắt buộc để giữ các trường đã nhận diện.
const brandPattern=/(?:h\s*i\s*g\s*h\s*l\s*a\s*n\s*d\s*s|h[i1l][gqc]h?lands)\s*(?:co[fep]{2,3}e?)?/i;
const isBrand=line=>brandPattern.test(ascii(line));
// Bảng đối chiếu cửa hàng từ hóa đơn thực đã xác nhận, KHÔNG dùng để suy ra
// những cửa hàng khác khi không có ShopID trên ảnh.
const VERIFIED_SHOP_IDS=Object.freeze({'30799':'KCN Bau Bang'});
const shopIdFrom=lines=>{
  const line=lines.find(value=>/shop\s*[i1l]\s*[d0]\b|shopid/i.test(value));
  return line?.match(/shop\s*[i1l]\s*[d0]\s*[:#\-]?\s*(\d{4,7})/i)?.[1]||'';
};
const moneyAtEnd=line=>{
  // Chấp nhận các ký hiệu nhiễu OCR sau số tiền (vd. "54,000 —= .", "15.000 SSS").
  // Vẫn chỉ đọc các token tiền VND 4+ chữ số để tránh Check/ShopID/QR.
  const match=clean(line).match(/(?:^|[\s:])[-−]?\s*(?:₫|đ|d)?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,8})(?:\s*(?:₫|đ|vnd))?(?:[\s\-–—=.<~>S]{0,25})$/iu);
  if(!match)return null;
  const number=Number(match[1].replace(/\D/g,''));
  return Number.isSafeInteger(number)&&number>=0?number:null;
};
const withoutMoney=line=>clean(line).replace(/\s*[-−]?\s*(?:₫|đ|d)?\s*(?:\d{1,3}(?:[.,]\d{3})+|\d{4,8})(?:\s*(?:₫|đ|vnd))?\s*$/iu,'').trim();
const labels={
  subtotal:/^(?:thanh tien|tam tinh|cong tien hang|subtotal)\b/,
  total:/^(?:tong tien|tong thanh toan|thuc thu|grand total|total)\b/,
  discount:/(?:giam gia|chiet khau|discount|voucher|uu dai)/,
  extra:/(?:phu thu|topping|them mon|them sua|upsize|nang size|extra shot)/,
  fee:/(?:phi giao hang|delivery fee|phi dich vu)/
};
const labelAmount=(lines,pattern)=>{
  const i=lines.findIndex(line=>pattern.test(ascii(line)));
  if(i<0)return null;
  return moneyAtEnd(lines[i])??moneyAtEnd(lines[i+1]||'');
};
const parseDate=lines=>{
  for(const line of lines){
    const m=line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
    if(!m)continue;
    const date=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    if(validDate(date))return {date,time:m[4]&&Number(m[4])<=23&&Number(m[5])<=59?m[4].padStart(2,'0')+':'+m[5]:''};
  }
  return {date:'',time:''};
};
const parseStore=lines=>{
  const brand=lines.findIndex(isBrand);
  if(brand<0){
    // Khi Tesseract bỏ mất logo, biển tên cửa hàng vẫn thường còn trên đầu hóa đơn.
    const candidate=lines.find(line=>/^(?:kcn|cn\b|chi nhanh|cua hang)\s+[a-z]/.test(ascii(line)));
    return candidate?clean(candidate.split(/,\s*/)[0]).slice(0,120):'';
  }
  for(let i=brand+1;i<Math.min(brand+5,lines.length);i++){
    const line=lines[i];
    const key=ascii(line);
    if(!line||/^(?:shopid|sdt|phone|hoa don|check|in store|ngay|pos|thu ngan)/.test(key))continue;
    const store=clean(line.split(/,\s*/)[0]).replace(/^(?:chi nhanh|cua hang)\s*:?\s*/i,'');
    if(store&&/[a-zA-ZÀ-ỹ]/.test(store))return store.slice(0,120);
  }
  return '';
};
const parseOrder=lines=>{
  const found=lines.map(line=>line.match(/\b(?:check|check\s*no|so\s*hoa\s*don|ma\s*don)\s*[:#]?\s*([A-Z0-9-]{4,25})/i)).find(Boolean);
  return found?.[1]||'';
};
const qtyItem=line=>{
  const match=clean(line).match(/^(\d{1,3})\s+(.+?)\s+([₫đ]?\s*\d{1,3}(?:[.,]\d{3})+|[₫đ]?\s*\d{4,8})(?:[\s\-–—=.<~>S]{0,25})$/iu);
  if(!match)return null;
  const qty=Number(match[1]),amount=moneyAtEnd(line);
  if(!qty||qty>100||amount===null||amount===0)return null;
  const name=clean(match[2]);
  if(!/[a-zA-ZÀ-ỹ]/u.test(name)||labels.subtotal.test(ascii(name))||labels.total.test(ascii(name)))return null;
  return {name,quantity:qty,amount};
};
function parseItems(lines){
  const firstTotal=lines.findIndex(line=>labels.subtotal.test(ascii(line))||labels.total.test(ascii(line)));
  const end=firstTotal<0?lines.length:firstTotal;
  const check=lines.findIndex(line=>/^(?:check\s*:|hoa don thanh toan|thu ngan\s*:)/.test(ascii(line)));
  const start=check<0?0:check+1;
  const items=[],options=[];
  for(let i=start;i<end;i++){
    const line=lines[i],key=ascii(line);
    if(labels.extra.test(key)){
      const amount=moneyAtEnd(line);
      options.push({name:withoutMoney(line),amount});
      continue;
    }
    let item=qtyItem(line);
    // Các cách OCR tách cột: "1 Tiramisu" rồi "39.000", hoặc
    // "1" / "Bánh Tiramisu" / "39.000"; không thu thập dòng tổng tiền.
    if(!item&&/^\d{1,2}\s+[^\d].+/.test(line)&&i+1<end&&moneyAtEnd(lines[i+1])!==null){
      item=qtyItem(line+' '+lines[i+1]);
      if(item)i+=1;
    }
    if(!item&&/^\d{1,2}$/.test(line)&&i+2<end&&moneyAtEnd(lines[i+2])!==null){
      item=qtyItem(line+' '+lines[i+1]+' '+lines[i+2]);
      if(item)i+=2;
    }
    if(!item&&i>start&&/^\d{1,2}$/.test(lines[i-1])&&moneyAtEnd(line)!==null){
      item=qtyItem(lines[i-1]+' '+line);
    }
    if(!item)continue;
    // Những tên dài có dòng phụ "510ml" ngay dưới giá.
    if(i+1<end&&/^(?:\d{2,4}\s?ml|size\s*[a-z0-9]+)$/i.test(clean(lines[i+1]))){
      item.name+=' '+clean(lines[++i]);
    }
    items.push(item);
  }
  return {items,options};
}
const parsePayment=lines=>{
  const section=ascii(lines.join(' '));
  if(/(?:payoo bank card|bank card|mastercard|\bvisa\b|\bnapas\b)/.test(section))return 'pos';
  if(/(?:highlands\s*card|the highlands)/.test(section))return 'highlands-card';
  if(/(?:momo|zalopay|shopeepay|vi dien tu|chuyen khoan|qr payment)/.test(section))return 'wallet';
  if(/(?:tien mat|\bcash\b)/.test(section))return 'cash';
  if(/(?:highlandsdi|highlands di app)/.test(section))return 'app';
  return '';
};
export function parseHighlandsReceipt(text){
  const lines=String(text??'').split(/\r?\n/).map(clean).filter(Boolean);
  const warnings=[],fields={};
  const branded=lines.some(isBrand);
  const combined=ascii(lines.join(' '));
  // Các tín hiệu POS kết hợp cho phép nhận hóa đơn khi logo bị nhận sai.
  const signals=[
    /\b(?:shop\s*id|shopid)\s*[:#]?\s*\d{3,}/.test(combined),
    /\bcheck\s*[:#]?\s*\d{4,}/.test(combined),
    /(?:hoa don thanh toan|hoa don tinh tien)/.test(combined),
    /(?:payoo|pager\s*:|\bpos0\d\b)/.test(combined),
    /(?:thanh tien|tong tien)/.test(combined)
  ].filter(Boolean).length;
  // Không nhận hóa đơn của thương hiệu khác dù có Check và Tổng tiền.
  if((/(?:starbucks|phuc long|the coffee house)/i.test(combined)&&!branded)||
    (!branded&&signals<2)){
    warnings.push('Chưa xác nhận đúng mẫu hóa đơn Highlands: cần logo hoặc ít nhất hai dấu hiệu POS (Check/ShopID/Thành tiền/Payoo).');
    return {fields,warnings,lines,items:[],time:'',recognizedBrand:false};
  }
  if(!branded)warnings.push('Logo Highlands đọc chưa rõ; đã nhận diện từ dấu hiệu hóa đơn POS. Hãy đối chiếu cửa hàng trước khi lưu.');
  const {date,time}=parseDate(lines);
  if(date)fields.date=date;
  const shopId=shopIdFrom(lines);
  const store=parseStore(lines);
  const verifiedStore=Object.hasOwn(VERIFIED_SHOP_IDS,shopId)?VERIFIED_SHOP_IDS[shopId]:'';
  if(verifiedStore){
    fields.store=verifiedStore;
    if(ascii(store)!==ascii(verifiedStore))
      warnings.push('Tên cửa hàng được chuẩn hóa từ ShopID '+shopId+' đã đối chiếu trên hóa đơn: '+verifiedStore+'. Vui lòng kiểm tra ảnh.');
  }else if(store)fields.store=store;
  const orderId=parseOrder(lines);if(orderId)fields.orderId=orderId;
  const {items,options}=parseItems(lines);
  if(items.length){
    fields.item=items.map(x=>x.name).join(' · ').slice(0,120);
    fields.itemsCount=String(items.reduce((sum,x)=>sum+x.quantity,0));
    fields.baseAmount=String(items.reduce((sum,x)=>sum+x.amount,0));
  }
  const extra=labelAmount(lines,labels.extra);
  const discount=labelAmount(lines,labels.discount);
  const subtotal=labelAmount(lines,labels.subtotal);
  const total=labelAmount(lines,labels.total);
  const fee=labelAmount(lines,labels.fee);
  // Máy POS có thể in Thành tiền/Tổng tiền nhòe nhưng Payoo Bank Card rõ.
  // Chỉ sử dụng tiền thanh toán khi có nhãn phương thức rõ ràng (không bao giờ
  // lấy một số bất kỳ ở cuối ảnh như QR, ShopID hoặc hotline).
  const paidLine=lines.find(line=>/(?:payoo\s*bank\s*card|bank\s*card|thanh\s*toan\s*(?:the|pos))/i.test(ascii(line)) &&
    moneyAtEnd(line)!==null);
  const paidAmount=paidLine?moneyAtEnd(paidLine):null;
  // Giữ giá món đã đọc; khi mất tên món, có thể khôi phục giá gốc từ
  // Thành tiền nếu không có phụ thu chưa nhận diện. Luôn gắn cảnh báo.
  if(!fields.baseAmount&&subtotal!==null&&extra===null){
    fields.baseAmount=String(subtotal);
    warnings.push('Chưa đọc đủ dòng món; giá gốc tạm lấy từ Thành tiền. Hãy kiểm tra phụ thu, số món và giá gốc trên ảnh.');
  }
  if(extra!==null)fields.extraAmount=String(extra);
  if(options.length)fields.extraReason=options.map(x=>x.name).join(' · ').slice(0,200);
  if(discount!==null)fields.discountAmount=String(discount);
  const discountLine=lines.find(line=>labels.discount.test(ascii(line)));
  if(discountLine){
    const description=withoutMoney(discountLine).replace(/^(?:giảm giá|giam gia|discount|ưu đãi|voucher|chiết khấu)\s*[:\-]?\s*/i,'').trim();
    if(description&&ascii(description)!==ascii(withoutMoney(discountLine)))fields.discountReason=description.slice(0,200);
  }
  if(fee!==null)fields.fee=String(fee);
  const payment=parsePayment(lines);if(payment)fields.payment=payment;
  if(total!==null)fields.amount=String(total);
  else if(subtotal!==null&&discount!==null&&subtotal>=discount){
    fields.amount=String(subtotal-discount);
    warnings.push('Không thấy nhãn Tổng tiền; thực trả đang được suy từ thành tiền trừ giảm giá.');
  }else if(subtotal!==null){
    fields.amount=String(subtotal);
    warnings.push('Không thấy nhãn Tổng tiền; vui lòng kiểm tra Thành tiền trên ảnh.');
  }else if(paidAmount!==null&&paidAmount>0){
    fields.amount=String(paidAmount);
    warnings.push('Nhãn Tổng tiền bị OCR bỏ sót; đã điền số thanh toán từ Payoo/Bank Card. Cần đối chiếu ảnh.');
  }
  // Khi chỉ nhận ra một phần món và tổng Payoo chính xác hơn, không tính
  // "thực trả" theo giá chưa đủ dòng món. Suy ra giá gốc CHỈ khi chưa thấy
  // giảm giá/phụ thu/phí; đánh dấu là ước tính để người dùng sửa.
  if(fields.amount&&extra===null&&discount===null&&fee===null&&subtotal===null&&
     (!fields.baseAmount||Number(fields.baseAmount)!==Number(fields.amount))){
    fields.baseAmount=fields.amount;
    warnings.push('Chưa đọc đủ giá từng món; giá gốc được suy ra từ số thực trả Payoo khi chưa thấy phụ thu/giảm giá. Hãy kiểm tra và sửa nếu cần.');
  }
  if(subtotal!==null&&total!==null&&subtotal-(discount||0)!==total)
    warnings.push('Thành tiền, giảm giá và tổng tiền không khớp; hãy kiểm tra trước khi lưu.');
  if(fields.baseAmount&&fields.amount&&
      calculatePayable(fields.baseAmount,fields.extraAmount||0,fields.discountAmount||0)!==Number(fields.amount))
    warnings.push('Cộng các dòng sản phẩm không khớp tổng hóa đơn; giữ nguyên số OCR để bạn đối chiếu.');
  if(!fields.orderId)warnings.push('Chưa đọc được Check No. / mã hóa đơn.');
  if(!items.length)warnings.push('Chưa đọc được danh sách món; cần xem lại vùng sản phẩm trên ảnh.');
  if(!fields.amount)warnings.push('Chưa đọc được tổng thanh toán.');
  warnings.push('Hóa đơn POS không xác nhận đã tích DRIPS; chỉ chọn "Đã quét tài khoản HighlandsĐI" khi bạn thực sự đã quét.');
  return {fields,warnings,lines,items,subtotal,time,recognizedBrand:branded,signals,shopId,storeSource:verifiedStore?'verified-shop-id':store?'ocr':''};
}

// Giữ mọi lượt OCR để đối soát các trường. Một lượt đọc rõ Check,
// lượt khác đọc rõ cửa hàng là bình thường với giấy in nhiệt.
export function mergeHighlandsReceiptCandidates(candidates){
  const attempts=(Array.isArray(candidates)?candidates:[]).filter(c=>c&&typeof c.text==='string'&&c.text.trim())
    .slice(0,6).map(c=>({
      label:String(c.label||'OCR'),
      confidence:Number(c.confidence||0),
      text:c.text,
      parsed:parseHighlandsReceipt(c.text)
    }));
  if(!attempts.length)return parseHighlandsReceipt('');
  const score=c=>{
    const f=c.parsed.fields||{};
    const balance=f.amount&&f.baseAmount&&Number(f.amount)===calculatePayable(f.baseAmount,f.extraAmount||0,f.discountAmount||0)?8:0;
    return (f.amount?40:0)+(f.baseAmount?12:0)+(f.item?22:0)+(f.orderId?11:0)+
      (f.date?12:0)+(f.store?9:0)+(f.payment?7:0)+(c.parsed.items?.length||0)*8+
      (c.parsed.storeSource==='verified-shop-id'?16:0)+balance+
      Math.min(5,c.confidence/20);
  };
  attempts.sort((a,b)=>score(b)-score(a));
  const primary=attempts[0];
  const fields={...primary.parsed.fields};
  const warnings=[...primary.parsed.warnings];
  // ShopID từ bất kỳ lượt đọc rõ nào được tin hơn việc đoán tên cửa hàng
  // từ một dòng địa chỉ đã méo, nhưng chỉ khi không có ShopID mâu thuẫn.
  // Ảnh crop chỉ chứa phần header có thể chưa đủ 2 dấu hiệu POS để parser
  // nhận dạng độc lập. Vẫn trích ShopID thô ở lượt này nhưng chỉ sử dụng
  // khi một lượt khác đã xác nhận được loại hóa đơn.
  const shopIds=[...new Set(attempts.map(a=>a.parsed.shopId||
    shopIdFrom(a.text.split(/\r?\n/).map(clean))).filter(Boolean))];
  const hasReceiptEvidence=attempts.some(a=>a.parsed.recognizedBrand||
    (a.parsed.signals||0)>=2);
  if(hasReceiptEvidence&&shopIds.length===1 && Object.hasOwn(VERIFIED_SHOP_IDS,shopIds[0])){
    const stable=VERIFIED_SHOP_IDS[shopIds[0]];
    if(fields.store!==stable){
      fields.store=stable;
      warnings.push('Đối chiếu nhiều lượt OCR: ShopID '+shopIds[0]+' tương ứng '+stable+'.');
    }
  }else if(shopIds.length>1){
    warnings.push('Các lượt OCR đọc ShopID khác nhau: '+shopIds.join(', ')+'. Hãy đối chiếu ảnh trước khi lưu.');
  }
  // Lấy những trường còn THIẾU từ lượt đọc khác, không tự ghi đè giá tiền
  // hoặc danh sách món đã đọc được. Mọi xung đột vẫn cần kiểm tra thủ công.
  const keys=['date','orderId','store','payment','item','itemsCount','baseAmount',
    'extraAmount','extraReason','discountAmount','discountReason','fee','amount'];
  for(const key of keys){
    if(fields[key]!==undefined&&fields[key]!==null&&fields[key]!=='')continue;
    const candidate=attempts.find(a=>a.parsed.fields[key]!==undefined&&
      a.parsed.fields[key]!==null&&a.parsed.fields[key]!=='');
    if(candidate)fields[key]=candidate.parsed.fields[key];
  }
  // Nếu đã chọn danh sách món tốt hơn từ lượt khác, lấy kèm giá gốc và
  // số lượng từ cùng lượt để tránh ghép dữ liệu của các hóa đơn OCR khác nhau.
  const bestItems=attempts.reduce((best,a)=>(a.parsed.items?.length||0)>(best.parsed.items?.length||0)?a:best,primary);
  if((bestItems.parsed.items?.length||0)>(primary.parsed.items?.length||0)){
    for(const key of ['item','itemsCount','baseAmount']){
      if(bestItems.parsed.fields[key]!==undefined)fields[key]=bestItems.parsed.fields[key];
    }
  }
  if(fields.amount&&fields.baseAmount&&
    calculatePayable(fields.baseAmount,fields.extraAmount||0,fields.discountAmount||0)!==Number(fields.amount)){
    warnings.push('Các lượt OCR chưa đối soát khớp giá món và thực trả; giữ nguyên số đọc được để sửa tay.');
  }
  const distinct=(messages)=>[...new Set(messages)];
  if(attempts.length>1)warnings.push('Đã đối chiếu '+attempts.length+' lượt OCR (ảnh gốc và ảnh làm rõ) để khôi phục trường bị thiếu.');
  return {
    ...primary.parsed,fields,warnings:distinct(warnings),confidence:primary.confidence,
    ocrVariants:attempts.map(a=>({label:a.label,confidence:a.confidence,text:a.text})),
    shopId:shopIds.length===1?shopIds[0]:(primary.parsed.shopId||'')
  };
}

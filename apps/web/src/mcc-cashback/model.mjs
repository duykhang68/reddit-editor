export const FIELDS = [
  'mcc','category','bank','card','network','spendGroup','rate','conditions',
  'cap','validity','rewardType','sourceUrl','checkedAt','notes','reviewStatus'
];
export function parseMccValues(values) {
  if (!Array.isArray(values) || !Array.isArray(values[0])) throw Error('Dữ liệu MCC không hợp lệ');
  const names = values[0].map(v => String(v || '').trim());
  for (const item of ['MCC','Ngân hàng','Visa / Mastercard','Cashback rate','Nguồn chính thức (URL)'])
    if (!names.includes(item)) throw Error('Thiếu cột dữ liệu: ' + item);
  return values.slice(1).filter(v => /^\\d{4}$/.test(String(v?.[0] || '').trim())).map(row => {
    const item = {};
    FIELDS.forEach((key,i) => item[key] = String(row[i] ?? '').trim());
    item.network = /^(visa|mastercard)$/i.test(item.network) ? item.network : 'Khác';
    item.reviewStatus ||= 'IMPORTED_UNVERIFIED';
    item.sourceUrl = /^https:\/\//i.test(item.sourceUrl) ? item.sourceUrl : '';
    return item;
  });
}
export function filterMcc(records,{query='',bank='',network='',category='',current=false}={}) {
  const term = String(query).trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return records.filter(r => {
    const haystack=[r.mcc,r.category,r.bank,r.card,r.spendGroup,r.conditions].join(' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return (!term || haystack.includes(term)) && (!bank || r.bank===bank) &&
      (!network || r.network.toLowerCase()===network.toLowerCase()) &&
      (!category || r.spendGroup===category) &&
      (!current || !/EXPIRED|HẾT HẠN|HET HAN/i.test(r.reviewStatus+' '+r.validity));
  });
}
export const distinct=(records,key)=>[...new Set(records.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));

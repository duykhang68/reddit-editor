// Portable Series metadata shared by Blogger HTML and Google Drive Markdown.
// Blogger sanitizes HTML comments; a hidden, attribute-only aside survives the allowlist.
export const emptySeries = () => ({enabled:false,name:'',part:1,total_parts:1,target_date:''});

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const stamp = Date.parse(date + 'T00:00:00.000Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === date;
}
export function seriesValidation(value) {
  if (!value?.enabled) return '';
  if (!String(value.name || '').trim()) return 'Nhập tên Series.';
  if (String(value.name).trim().length > 180) return 'Tên Series tối đa 180 ký tự.';
  const part = Number(value.part), total = Number(value.total_parts);
  if (!Number.isInteger(part) || part < 1 || part > 9999) return 'Tập hiện tại phải là số nguyên từ 1–9999.';
  if (!Number.isInteger(total) || total < 1 || total > 9999) return 'Tổng số tập phải là số nguyên từ 1–9999.';
  if (part > total) return 'Tập hiện tại không thể lớn hơn tổng số tập.';
  if (value.target_date && !validDate(String(value.target_date))) return 'Ngày kết thúc phải theo định dạng YYYY-MM-DD hợp lệ.';
  return '';
}
export function normalizeSeries(value) {
  if (!value?.enabled || seriesValidation(value)) return null;
  const part = Number(value.part), total_parts = Number(value.total_parts);
  return {
    name:String(value.name).trim(),
    part,
    total_parts,
    target_date:String(value.target_date || ''),
    status:part === total_parts ? 'completed' : 'in_progress'
  };
}
export function editableSeries(value) {
  if (!value) return emptySeries();
  return {enabled:true,name:String(value.name||''),part:Number(value.part)||1,
    total_parts:Number(value.total_parts)||1,target_date:String(value.target_date||'')};
}
export function seriesProgress(series) {
  const s=normalizeSeries(series);
  return s ? Math.min(100,Math.round((s.part/s.total_parts)*100)) : 0;
}
export function daysUntilTarget(iso, now = new Date()) {
  if (!validDate(String(iso||''))) return null;
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const target=Date.parse(iso+'T00:00:00.000Z');
  return Math.round((target-today)/86400000);
}

const MARKER=/<aside\b(?=[^>]*\bdata-kind=["']series-metadata["'])[^>]*>\s*<\/aside>\s*/gi;
export function extractSeriesFromHTML(content) {
  let series=null;
  const html=String(content||'').replace(MARKER, match=>{
    const encoded=match.match(/\bdata-series=["']([^"']*)["']/i)?.[1];
    if (encoded) {
      try {
        const candidate=JSON.parse(decodeURIComponent(encoded));
        const parsed=normalizeSeries({...candidate,enabled:true});
        if (parsed) series=parsed;
      } catch { /* malformed metadata must not crash the editor */ }
    }
    return '';
  });
  return {html,series:editableSeries(series)};
}
export function withSeriesHTML(content, value) {
  const {html}=extractSeriesFromHTML(content);
  const series=normalizeSeries(value);
  if (!series) return html;
  // encodeURIComponent prevents markup/attribute injection and keeps Blogger's HTML valid.
  return '<aside hidden="hidden" class="dn-series-metadata" data-kind="series-metadata" data-series="'+encodeURIComponent(JSON.stringify(series))+'"></aside>\n'+html;
}
export function seriesFrontmatter(value) {
  const s=normalizeSeries(value);
  if (!s) return '';
  // JSON double-quoted strings are valid YAML strings, including Unicode and colons.
  return '---\nseries:\n'
    +'  name: '+JSON.stringify(s.name)+'\n'
    +'  part: '+s.part+'\n'
    +'  total_parts: '+s.total_parts+'\n'
    +'  target_date: '+JSON.stringify(s.target_date)+'\n'
    +'  status: '+JSON.stringify(s.status)+'\n'
    +'---\n\n';
}
export function consumeSeriesFrontmatter(content) {
  const match=String(content).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {content,series:emptySeries()};
  const seriesBlock=match[1].match(/(?:^|\n)series:\r?\n((?:  [^\r\n]*(?:\r?\n|$))*)/);
  if(!seriesBlock)return {content:String(content).slice(match[0].length).replace(/^\r?\n/,''),series:emptySeries()};
  try {
    const fields={};
    for (const line of seriesBlock[1].split(/\r?\n/)) {
      if (!line.trim()) continue;
      const item=line.match(/^  (name|part|total_parts|target_date|status): (.*)$/);
      if (item) fields[item[1]]=JSON.parse(item[2]);
    }
    const series=editableSeries(fields);
    if (seriesValidation(series)) return {content,series:emptySeries()};
    return {content:String(content).slice(match[0].length).replace(/^\r?\n/, ''),series};
  } catch {return {content,series:emptySeries()};}
}

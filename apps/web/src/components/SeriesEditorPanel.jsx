import React from 'react';
import {daysUntilTarget, seriesProgress, seriesValidation} from '../services/series.js';

export default function SeriesEditorPanel({value, onChange, disabled=false}) {
  const update=patch=>onChange({...value,...patch});
  const issue=seriesValidation(value);
  const progress=seriesProgress(value);
  const days=daysUntilTarget(value.target_date);
  return <section className="kit-panel series-panel" aria-label="Viết bài theo Series">
    <div className="kit-panel-body">
      <h2>📖 Viết bài theo Series</h2>
      <label className="series-toggle"><input type="checkbox" checked={!!value.enabled} disabled={disabled}
        onChange={event=>update({enabled:event.target.checked})}/> Bật chế độ Viết bài theo Series</label>
      {value.enabled && <div className="series-fields">
        <label htmlFor="series-name">Tên Series
          <input id="series-name" type="text" maxLength={180} value={value.name} disabled={disabled}
            onChange={e=>update({name:e.target.value})} placeholder="Ví dụ: Làm chủ CI/CD từ A–Z"/>
        </label>
        <div className="series-field-grid">
          <label htmlFor="series-part">Tập hiện tại (Part)
            <input id="series-part" type="number" min="1" max="9999" step="1" value={value.part}
              disabled={disabled} onChange={e=>update({part:e.target.value})}/>
          </label>
          <label htmlFor="series-total">Tổng số tập (Total Parts)
            <input id="series-total" type="number" min="1" max="9999" step="1" value={value.total_parts}
              disabled={disabled} onChange={e=>update({total_parts:e.target.value})}/>
          </label>
        </div>
        <label htmlFor="series-date">Ngày kết thúc dự kiến (Target Date)
          <input id="series-date" type="date" value={value.target_date} disabled={disabled}
            onChange={e=>update({target_date:e.target.value})}/>
        </label>
        {issue && <p className="series-error" role="alert">{issue}</p>}
        <div className="series-meter-head"><strong>Tiến độ</strong><span>{issue?'—':progress+'%'}</span></div>
        <div className="series-meter" role="progressbar" aria-label="Tiến độ Series" aria-valuemin={0} aria-valuemax={100} aria-valuenow={issue?0:progress}>
          <span style={{width:(issue?0:progress)+'%'}}/>
        </div>
        <p className="series-days">{days===null?'Chọn ngày kết thúc để xem đếm ngược.':days>0?'Còn '+days+' ngày đến hạn.':days===0?'Hạn hoàn thành là hôm nay.':'Đã quá hạn '+Math.abs(days)+' ngày.'}</p>
        <p className="series-note">Metadata được xuất dưới dạng YAML Frontmatter khi lưu Markdown lên Drive và lưu ẩn trong HTML Blogger.</p>
      </div>}
    </div>
  </section>;
}

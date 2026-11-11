import React from 'react';
import {SERIES_BLUEPRINTS} from './seriesBlueprints.js';
export {SERIES_BLUEPRINTS} from './seriesBlueprints.js';


export default function BlueprintSelector({onInsert,disabled=false}) {
  return <section className="kit-panel blueprint-panel" aria-label="Mẫu dàn ý Series">
    <div className="kit-panel-body">
      <h2>✦ Mẫu dàn ý Series</h2>
      <p>Chọn một mẫu để chèn dàn ý vào nội dung bài hiện tại. Nội dung cũ không bị ghi đè.</p>
      <label htmlFor="series-blueprint">Chọn dàn ý
        <select id="series-blueprint" defaultValue="" disabled={disabled}
          onChange={e=>{
            const blueprint=SERIES_BLUEPRINTS.find(item=>item.id===e.target.value);
            if (blueprint) onInsert(blueprint.markdown);
            e.target.value='';
          }}>
          <option value="" disabled>{`Chọn một trong ${SERIES_BLUEPRINTS.length} mẫu…`}</option>
          {SERIES_BLUEPRINTS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
    </div>
  </section>;
}

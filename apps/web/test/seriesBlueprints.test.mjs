import test from 'node:test';
import assert from 'node:assert/strict';
import {SERIES_BLUEPRINTS} from '../src/components/seriesBlueprints.js';

test('Six Series outlines are available with stable unique IDs',()=>{
  assert.equal(SERIES_BLUEPRINTS.length,6);
  assert.deepEqual(SERIES_BLUEPRINTS.slice(0,4).map(item=>item.id),[
    'tutorial','journal','review','general'
  ]);
  assert.deepEqual(SERIES_BLUEPRINTS.slice(4).map(item=>item.id),[
    'cinema-review','device-hands-on'
  ]);
  assert.equal(new Set(SERIES_BLUEPRINTS.map(item=>item.id)).size,SERIES_BLUEPRINTS.length);
  for(const item of SERIES_BLUEPRINTS){
    assert.ok(item.label.trim().length>5);
    assert.match(item.markdown,/^## /);
    assert.ok(item.markdown.length>200);
    assert.match(item.markdown,/### /);
  }
});

test('Cinema review outline covers real theater experience and spoiler handling',()=>{
  const film=SERIES_BLUEPRINTS.find(item=>item.id==='cinema-review');
  assert.match(film.label,/phim chiếu rạp/i);
  for(const heading of ['Thông tin phim','không spoiler','Kịch bản','Diễn xuất','trải nghiệm tại rạp','Điểm cộng','mua vé','CẢNH BÁO SPOILER','Kết luận']){
    assert.ok(film.markdown.toLowerCase().includes(heading.toLowerCase()),heading);
  }
  assert.match(film.markdown,/không bịa doanh thu/i);
});

test('Hands-on outline distinguishes first impressions from independently tested results',()=>{
  const device=SERIES_BLUEPRINTS.find(item=>item.id==='device-hands-on');
  assert.match(device.label,/Trên tay.*công nghệ/i);
  for(const heading of ['Sản phẩm','Mở hộp','hoàn thiện','Màn hình','Cấu hình','Thử nhanh','Điểm thích','So sánh','Ai nên mua','Kết luận']){
    assert.ok(device.markdown.toLowerCase().includes(heading.toLowerCase()),heading);
  }
  assert.match(device.markdown,/chưa phải đánh giá dài hạn/i);
  assert.match(device.markdown,/không tự nhận đã test/i);
});

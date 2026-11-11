import React from 'react';

// allSeriesPosts entries: {id, title, url, status, series:{name,part,total_parts}}.
// This component does not fetch data or trust unverified URLs.
export default function SeriesIndexTable({seriesName='',currentPart=1,allSeriesPosts=[]}) {
  const posts=allSeriesPosts
    .filter(post=>String(post.series?.name||post.seriesName||'').trim().toLocaleLowerCase()===String(seriesName).trim().toLocaleLowerCase())
    .map(post=>({...post,part:Number(post.series?.part??post.part)}))
    .filter(post=>Number.isInteger(post.part)&&post.part>0)
    .sort((a,b)=>a.part-b.part||String(a.title||'').localeCompare(String(b.title||''),'vi'));
  return <section className="kit-panel series-index" aria-label="Mục lục Series">
    <div className="kit-panel-body">
      <h2>☷ Mục lục Series</h2>
      <p className="series-index-name">{seriesName||'Chưa đặt tên Series'}</p>
      {!posts.length ? <p className="series-note">Chưa tìm thấy tập trong dữ liệu đã tải. Lưu bài hoặc làm mới mục lục để cập nhật.</p> :
        <div className="series-table-scroll"><table>
          <thead><tr><th scope="col">Tập</th><th scope="col">Bài viết</th><th scope="col">Trạng thái</th></tr></thead>
          <tbody>{posts.map((post,index)=>{
            const current=post.part===Number(currentPart);
            let link=null;try{const candidate=new URL(post.url);if(['http:','https:'].includes(candidate.protocol))link=candidate.href;}catch{/* no link for drafts */}
            return <tr key={String(post.id||'part')+'-'+index} className={current?'series-current':''}>
              <td>{post.part}</td><td>{link?<a href={link} target="_blank" rel="noopener noreferrer" aria-current={current?'page':undefined}>{post.title||'Chưa đặt tiêu đề'}</a>:<span aria-current={current?'page':undefined}>{post.title||'Chưa đặt tiêu đề'}</span>}{current&&<span className="series-current-tag">Đang xem</span>}</td><td>{String(post.status||'').toLowerCase()==='live'?'Đã đăng':'Bản nháp'}</td>
            </tr>;
          })}</tbody>
        </table></div>}
    </div>
  </section>;
}

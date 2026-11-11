import {Extension,Node,mergeAttributes} from '@tiptap/core';

export const BLOCKS=[
  ['info','ⓘ','Thông tin','Thêm thông tin cần biết'],
  ['tip','✓','Mẹo hữu ích','Làm nổi bật một mẹo thực hành'],
  ['warning','!','Lưu ý quan trọng','Thêm cảnh báo cho người đọc'],
  ['quote','❞','Trích dẫn','Trích dẫn và ghi nguồn'],
  ['code','⌘','Đoạn mã','Chèn khối mã nguồn'],
  ['check','☐','Checklist','Danh sách các việc cần kiểm tra'],
  ['steps','①','Hướng dẫn từng bước','Trình bày quy trình theo thứ tự'],
  ['table','▦','Bảng so sánh','So sánh hai phương án'],
  ['faq','⌄','FAQ thu gọn','Câu hỏi và câu trả lời có thể thu gọn'],
  ['spoiler','◉','Ẩn nội dung','Nội dung người đọc bấm để mở'],
  ['cta','↗','Nút liên kết','Thêm nút dẫn tới một trang web'],
  ['divider','—','Đường phân cách','Ngăn cách các phần nội dung'],
  ['image','▧','Ảnh có chú thích','Chèn ảnh từ URL công khai'],
];

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function blockHTML(kind,values={}){
  const details=summary=>`<details class="hd-faq"><summary>${summary}</summary><div class="hd-faq-body"><p>Viết nội dung của bạn tại đây.</p></div></details>`;
  const templates={
    info:'<aside class="hd-note hd-note--info" data-kind="info"><p><strong>Thông tin cần biết</strong></p><p>Điền thông tin giúp người đọc hiểu rõ hơn.</p></aside>',
    tip:'<aside class="hd-note hd-note--tip" data-kind="tip"><p><strong>Mẹo hữu ích</strong></p><p>Chia sẻ một mẹo để người đọc áp dụng dễ dàng hơn.</p></aside>',
    warning:'<aside class="hd-note hd-note--warning" data-kind="warning"><p><strong>Lưu ý quan trọng</strong></p><p>Nêu điều cần kiểm tra trước khi thực hiện.</p></aside>',
    quote:'<blockquote class="hd-quote"><p>Một trích dẫn đáng nhớ.</p><p><em>— Nguồn trích dẫn</em></p></blockquote>',
    code:'<pre class="hd-codewrap"><code>console.log("Xin chào Blogger!");</code></pre>',
    check:'<ul class="hd-checklist"><li><p>Chuẩn bị nội dung</p></li><li><p>Kiểm tra thông tin</p></li><li><p>Xem trước bài viết</p></li></ul>',
    steps:'<ol class="hd-steps"><li><p><strong>Bước 1:</strong> Chuẩn bị dữ liệu.</p></li><li><p><strong>Bước 2:</strong> Thực hiện thao tác.</p></li><li><p><strong>Bước 3:</strong> Kiểm tra kết quả.</p></li></ol>',
    table:'<table><tbody><tr><th><p>Tiêu chí</p></th><th><p>Phương án A</p></th><th><p>Phương án B</p></th></tr><tr><td><p>Ưu điểm</p></td><td><p>Dễ sử dụng</p></td><td><p>Linh hoạt</p></td></tr><tr><td><p>Hạn chế</p></td><td><p>Cơ bản</p></td><td><p>Cần cấu hình</p></td></tr></tbody></table>',
    faq:details('Câu hỏi thường gặp là gì?'),
    spoiler:details('Bấm để xem nội dung ẩn'),
    cta:`<p><a class="hd-btn" href="${escape(values.url||'https://example.com')}" target="_blank" rel="noopener noreferrer">${escape(values.label||'Tìm hiểu thêm')} →</a></p>`,
    divider:'<hr class="hd-divider">',
    image:`<figure><img src="${escape(values.url||'')}" alt="${escape(values.alt||'')}"><figcaption>${escape(values.caption||'Chú thích hình ảnh')}</figcaption></figure>`,
  };
  return templates[kind]||'';
}

// Preserve the theme's component classes through Compose → HTML → Compose.
const classes={blockquote:['hd-quote'],bulletList:['hd-checklist'],orderedList:['hd-steps'],codeBlock:['hd-codewrap'],horizontalRule:['hd-divider'],link:['hd-btn']};
const ArticleClasses=Extension.create({
  name:'articleClasses',
  addGlobalAttributes(){return Object.entries(classes).map(([type,allowed])=>({
    types:[type],attributes:{articleClass:{default:null,
      parseHTML:element=>allowed.filter(name=>element.classList.contains(name)).join(' ')||null,
      renderHTML:attrs=>attrs.articleClass?{class:allowed.filter(name=>attrs.articleClass.split(' ').includes(name)).join(' ')}:{},
    }},
  }));},
});
const ArticleSummary=Node.create({
  name:'articleSummary',content:'inline*',defining:true,
  parseHTML(){return [{tag:'summary'}];},renderHTML(){return ['summary',0];},
});
const ArticleDetailsContent=Node.create({
  name:'articleDetailsContent',content:'block+',defining:true,
  parseHTML(){return [{tag:'div.hd-faq-body'},{tag:'details > div'}];},
  renderHTML(){return ['div',{class:'hd-faq-body'},0];},
});
const ArticleDetails=Node.create({
  name:'articleDetails',group:'block',content:'articleSummary articleDetailsContent',defining:true,isolating:true,
  parseHTML(){return [{tag:'details'}];},
  renderHTML({HTMLAttributes}){return ['details',mergeAttributes(HTMLAttributes,{class:'hd-faq'}),0];},
  // All content stays editable; exported HTML uses native, collapsible <details>.
  addNodeView(){return ({view})=>{
    const dom=view.dom.ownerDocument.createElement('div');dom.className='hd-faq hd-faq-editing';
    return {dom,contentDOM:dom};
  };},
});
const ArticleCaption=Node.create({
  name:'articleCaption',content:'inline*',defining:true,
  parseHTML(){return [{tag:'figcaption'}];},renderHTML(){return ['figcaption',0];},
});
const ArticleFigure=Node.create({
  name:'articleFigure',group:'block',content:'image articleCaption?',defining:true,
  parseHTML(){return [{tag:'figure'}];},renderHTML(){return ['figure',0];},
});
export const ArticleBlocks=[ArticleClasses,ArticleSummary,ArticleDetailsContent,ArticleDetails,ArticleCaption,ArticleFigure];

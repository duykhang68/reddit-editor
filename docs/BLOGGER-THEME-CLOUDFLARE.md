# Blogger Theme Assets — GitHub + Cloudflare Pages

**Mục tiêu:** Sửa CSS/JavaScript của blog `https://duynguyen99.blogspot.com/` thông qua GitHub và Cloudflare Pages, không cần tải lại XML cho mỗi thay đổi CSS/JS.

- GitHub (repository duy nhất): https://github.com/duykhang68/tetdinhmuiblog
- Editor hiện tại: https://duynguyen-reddit-editor.pages.dev/
- Blog: https://duynguyen99.blogspot.com/
- Mã nguồn CSS: `apps/web/public/blogger-assets/theme.css`
- Mã nguồn JS: `apps/web/public/blogger-assets/theme.js`

## 1. Kiểm tra Cloudflare Pages build

Cấu hình dự kiến khi Pages Git integration trỏ đến repository này và root ở thư mục gốc:

- Production branch: `main`
- Build command: `npm run build` (Node >=22.12; dependencies được cài từ package-lock)
- Build output directory: `apps/web/dist`

Nếu Cloudflare root được đặt thành `apps/web`, build output phải là `dist` thay vì `apps/web/dist`; hãy đối chiếu cài đặt thực tế. GitHub Actions CI build và upload artifact, **không tự nó chứng minh Cloudflare Pages đã kết nối GitHub hoặc đã deploy**.

Sau khi Cloudflare deploy thành công, kiểm tra bằng trình duyệt:

1. https://duynguyen-reddit-editor.pages.dev/blogger-assets/version.json — phải trả về JSON, không phải HTML của Editor.
2. https://duynguyen-reddit-editor.pages.dev/blogger-assets/theme.css — phải trả về CSS.
3. https://duynguyen-reddit-editor.pages.dev/blogger-assets/theme.js — phải trả về JavaScript.

Nếu một URL trả về 404 / HTML của ứng dụng, sửa cấu hình Pages trước khi thay theme Blogger.

## 2. Chèn một lần vào theme XML Blogger

**Sao lưu theme XML hiện tại trước** trong Blogger → Theme → Backup. Tránh thay đổi template XML nếu chưa có backup.

Blogger → Theme → Edit HTML.

Thêm trong `<head>` trước `</head>`:

```xml
<link href='https://duynguyen-reddit-editor.pages.dev/blogger-assets/theme.css' rel='stylesheet' type='text/css'/>
```

Thêm gần cuối, trước `</body>`:

```xml
<script defer='defer' src='https://duynguyen-reddit-editor.pages.dev/blogger-assets/theme.js'></script>
```

Lưu theme. Đây là thao tác gắn kết **một lần**; các thay đổi tiếp theo ở hai asset không cần thay XML trừ khi sửa widget, layout, các thẻ `b:` hoặc cấu trúc template của Blogger.

**Lưu ý:** CSS/JS hiện là bản khởi tạo an toàn — chưa thay đổi layout hay tính năng blog. Hãy đặt các CSS selectors/JS behaviors thực tế vào hai file sau khi kiểm tra trên blog.

## 3. Quy trình cập nhật về sau

1. Tạo branch mới từ `main` trong `duykhang68/tetdinhmuiblog`.
2. Sửa `theme.css` hoặc `theme.js`; mỗi tính năng là một PR riêng.
3. CI `npm run check` và `npm run build` phải thành công; review thay đổi JS cẩn thận vì JS chạy trong origin của Blogger.
4. Merge theo branch protection; khi Cloudflare Pages Git integration đã bật, Cloudflare sẽ build từ `main`.
5. Kiểm tra URL asset rồi tải lại blog. Chính sách cache trình duyệt dự kiến tối đa 60 giây, nhưng các cache khác hoặc tình trạng deploy có thể gây chậm.
6. Nếu có regression, revert PR/commit trong GitHub, chờ Cloudflare deploy lại và xác minh blog.

## 4. Giới hạn quan trọng

- Đây không phải Blogger Theme XML API: các thẻ `b:section`, `b:widget`, `b:skin`, `data:...` và các cấu trúc template gốc vẫn cần chỉnh qua Blogger → Theme → Edit HTML.
- Google Drive API không bắt buộc cho bước phân phối CSS/JS. Có thể thêm backup XML/phiên bản vào Drive ở PR độc lập.
- Không chèn token, OAuth secret, cookie hay thông tin cá nhân vào `theme.js` hoặc CSS/JS công khai.
- `theme.css` và `theme.js` là URL **ổn định**, không có hash. Nếu cần phát hành có version immutable và rollback lập tức, thêm quy trình phát hành phiên bản riêng.
- Các tài nguyên được phục vụ từ dự án Editor trên Cloudflare Pages; một lần thay đổi sai `_headers` hoặc cấu hình Pages có thể ảnh hưởng khả năng truy cập, nên giữ cấu hình hẹp.

## 5. Chạy kiểm tra

```bash
npm ci
npm run check
npm run build
```

Kiểm tra `apps/web/dist/blogger-assets/` có đủ ba file `theme.css`, `theme.js` và `version.json` trước khi phát hành.

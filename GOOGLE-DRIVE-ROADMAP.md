# Local Editor → Google Drive: triển khai và nghiệm thu

Mã nguồn đã tích hợp GIS và Google Drive API trực tiếp từ trình duyệt. Client ID bạn cung cấp đã được điền trong `apps/web/.env.local` (không cần Client Secret). Luồng Blogger cũ vẫn sử dụng backend riêng.

## Bước 1 — Bạn thao tác trong Google Cloud

Phiên làm việc này không truy cập được Google Cloud Console của bạn. Các thiết lập sau chưa được xác nhận.

1. Mở https://console.cloud.google.com/ và chọn project sở hữu OAuth Client ID bắt đầu bằng `731179252358-`.
2. APIs & Services → Library → tìm **Google Drive API** → **Enable**. Liên kết: https://console.cloud.google.com/apis/library/drive.googleapis.com
3. Google Auth Platform → Clients (hoặc APIs & Services → Credentials) → mở OAuth client loại **Web application** có đúng Client ID đã gửi.
4. Authorized JavaScript origins → Add URI → nhập chính xác **http://localhost:5173** → Save. Đây là origin, không thêm đường dẫn hay dấu `/` cuối. Luồng Drive dùng popup GIS, không cần redirect URI mới. Giữ callback Blogger nếu đang sử dụng Blogger.
5. Google Auth Platform → Data Access → Add or Remove Scopes → thêm **https://www.googleapis.com/auth/drive.file** → Update / Save. Nếu có Blogger, giữ scope Blogger hiện tại.
6. Nếu ứng dụng External ở chế độ Testing: Audience → Test users → thêm email Google sẽ đăng nhập → Save.

`drive.file` cấp quyền cho các file ứng dụng tạo hoặc người dùng cấp quyền riêng cho ứng dụng. Nó không cho liệt kê toàn bộ Drive. Bản này chưa có Google Picker; hãy tạo file bằng Editor rồi mở lại từ danh sách của Editor. Đây là quyền hạn chế phạm vi, không có nghĩa “an toàn tuyệt đối”.

## Bước 2 — Đã triển khai trong dự án

- Script GIS trong `apps/web/index.html`.
- `apps/web/src/services/googleDriveService.js`: login, kiểm tra quyền, token có thời hạn trong RAM, danh sách có phân trang, đọc nội dung, tạo `POST`, cập nhật `PATCH` theo file ID.
- Upload theo `multipart/related` mà Drive yêu cầu. Không dùng FormData `multipart/form-data` từ mã mẫu.
- Kiểm tra HTTP, lỗi cấp quyền, API chưa bật, popup bị đóng/chặn, hết phiên và file thay đổi.
- Kiểm tra `version` trước cập nhật; thêm `If-Match` nếu Google cho trình duyệt đọc ETag. Khi chỉ có version, vẫn tồn tại khoảng đua ngắn giữa đọc và ghi; tránh sửa cùng file đồng thời ở nhiều cửa sổ.
- Bảng **Google Drive · Markdown**: cấu hình Client ID, kết nối/đổi tài khoản/ngắt phiên, lưu/cập nhật, làm mới, mở bài và liên kết tới file thật.
- Chuyển HTML từ TipTap thành Markdown; giữ bảng và khối HTML phong phú dưới dạng HTML trong `.md`. Tiêu đề/nhãn nằm trong metadata của Editor. Đọc file dùng Markdown parser và lọc HTML bằng DOMPurify.
- Editor mở được khi chưa kết nối Blogger. Nháp cục bộ hoạt động cả ở chế độ này.

Token Drive không lưu vào localStorage, không gửi tới backend. Tải lại trang cần kết nối Drive lại. Client ID và bản nháp bài viết có thể được lưu cục bộ; không có Client Secret ở frontend. **Ngắt Drive** chỉ xóa phiên hiện tại, không thu hồi quyền đã cấp tại Google Account.

Lưu Drive và lưu Blogger là hai thao tác riêng. Công tắc tự động lưu nháp hiện dành cho Blogger; Drive lưu bằng nút bấm. Khi mở bài trên Drive, Blogger Post ID được xóa để tránh cập nhật nhầm bài cũ. Sau tải lại trang hoặc khôi phục nháp cục bộ, muốn cập nhật file Drive cũ hãy mở lại file từ danh sách Drive để lấy ID/phiên bản; nếu lưu ngay sẽ tạo file mới.

## Bước 3 — Shortcut đã tạo

macOS: double-click **start-editor.command** ngay trong thư mục dự án. File đã có quyền thực thi. Script chạy `npm run dev -- --open`, tự mở trình duyệt tại **http://localhost:5173**. Giữ cửa sổ Terminal trong lúc viết; Ctrl+C để dừng.

Windows: double-click **start-editor.bat**. Bản Windows chưa được kiểm tra trên máy Windows.

Cần Node.js 22.12+ và npm. Nếu chưa có `node_modules`, shortcut sẽ chạy `npm ci`. Khi chuyển dự án giữa Mac và Windows, cài lại dependencies trên hệ điều hành đích. Nếu macOS chặn file tải về, chạy trong Terminal tại thư mục dự án:

```bash
bash start-editor.command
```

Nếu cổng 5173 đang được dùng, dừng Editor cũ rồi chạy lại. Vite giữ cố định cổng để không lệch OAuth origin.

Không có `apps/server/.env`: `npm run dev` chỉ chạy frontend cho Drive/local. Có file đó: chạy thêm backend Blogger. Không cần tạo cấu hình Blogger để dùng Drive.

## Bước 4 — Bạn nghiệm thu với tài khoản thật

1. Hoàn tất bước 1, rồi chạy shortcut ở bước 3.
2. Tại bảng **Google Drive · Markdown**, kiểm tra Client ID đã điền → **Kết nối Drive** → chọn tài khoản → cấp quyền.
3. Nhập tiêu đề **Kiểm tra Drive lần đầu**, viết vài đoạn, thêm nhãn nếu muốn → **Lưu .md lên Drive**.
4. Chờ thông báo đã lưu. Bấm **Xem file trên Drive ↗**, xác nhận tên `Kiểm tra Drive lần đầu.md` và nội dung.
5. Sửa thêm một câu → **Cập nhật file .md**. Kiểm tra file ID trên liên kết vẫn giữ nguyên và không có file trùng.
6. Bấm **Bài viết mới**, rồi mở file vừa lưu trong danh sách Drive. Kiểm tra tiêu đề, nhãn, tiếng Việt, nội dung và Preview.
7. Tải lại trang → kết nối Drive lại → mở file từ danh sách để tiếp tục cập nhật.

Không cần bấm Kết nối Blogger cho bước nghiệm thu này.

## Kiểm chứng đã chạy trong phiên triển khai

- `npm run check`: 14 tests đạt, gồm Blogger hiện có và Drive với phản hồi Google giả lập.
- `npm run build`: đạt. Vite có cảnh báo bundle lớn; không chặn build.
- `bash -n start-editor.command`: đạt.
- Chạy dev trong môi trường công cụ bị chặn mở cổng: `listen EPERM ::1:5173`. Vì vậy chưa xác nhận shortcut mở ứng dụng thật trên máy người dùng.
- Công cụ trình duyệt không kết nối được trong phiên này; chưa kiểm tra trực quan và chưa đăng nhập, đọc/ghi Drive thật. Bước 1 và nghiệm thu ở bước 4 còn cần người dùng thực hiện.

## Nếu gặp lỗi

| Lỗi | Cách xử lý |
|---|---|
| `origin_mismatch` | Thêm đúng `http://localhost:5173` vào JavaScript origins của đúng Client ID, lưu rồi thử lại. |
| `access_denied` / app testing | Thêm email vào Test users và cấp quyền Drive khi đăng nhập. |
| HTTP 403 / API disabled | Bật Google Drive API trong project sở hữu Client ID; kiểm tra scope đã cấp. |
| GIS chưa tải / popup không mở | Kiểm tra mạng, trình chặn nội dung, cho phép popup cho localhost rồi bấm lại. |
| Hết phiên / HTTP 401 | Bấm Kết nối Drive lại, rồi mở file cũ trong danh sách trước khi cập nhật. |
| File đã thay đổi | Sao chép nội dung đang viết ra ngoài trước; mở lại bản Drive, đối chiếu và áp dụng thay đổi. |
| Không thấy file Markdown cũ | `drive.file` chỉ thấy các file ứng dụng được cấp quyền. Bản này không có Picker để chọn file ngoài phạm vi đó. |

Tài liệu Google: [GIS token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

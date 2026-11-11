# Cloudflare Pages — Google Drive OAuth Client ID (không phải nhập tay)

**Dự án:** `duykhang68/tetdinhmuiblog` · **Pages:** `duynguyen-reddit-editor` · **Frontend:** React + Vite tại `apps/web`.

## Thay đổi trong mã nguồn

- `apps/web/src/DrivePanel.jsx` lấy `import.meta.env.VITE_GOOGLE_CLIENT_ID` làm **ưu tiên số 1**, kể cả khi trình duyệt còn Client ID cũ trong `localStorage`.
- Nếu biến đã được cấu hình, Editor **ẩn ô OAuth Client ID**, chỉ để nút Kết nối Drive (và các thao tác Drive khác).
- Nếu **chưa** cấu hình biến, Editor thử Client ID đã lưu ở trình duyệt, sau đó truy vấn `GET /api/drive-client-config` (cùng origin) để tận dụng `GOOGLE_DRIVE_CLIENT_ID` hoặc `GOOGLE_CLIENT_ID` đang cấu hình tại Cloudflare runtime. **Chỉ khi tất cả đều thiếu/không hợp lệ mới hiện ô nhập thủ công.**
- Nếu Google từ chối một Client ID tự động (ví dụ `origin_mismatch`), cho phép nhập ID khác để phục hồi và chỉ lưu ID thủ công sau khi kết nối thành công.
- Editor **không lưu** Client ID từ môi trường vào `localStorage`. Khi thay đổi biến và deploy lại, bundle mới sử dụng ID mới.
- Đây là **Client ID công khai** của ứng dụng OAuth Web, tuyệt đối **không** đặt Client Secret, access token hoặc refresh token vào biến `VITE_*`.

## Hotfix 2026-11-07 — Editor tự tìm OAuth Client ID từ runtime

Trang **Editor → Google Drive · Markdown** nay dùng cùng bộ resolver như **Expenses**, theo thứ tự:

1. **Build:** `VITE_GOOGLE_CLIENT_ID` hợp lệ (được Vite nhúng vào bundle khi build).
2. **Trình duyệt:** `dn-editor-drive-client-id` chỉ chứa Client ID công khai từng nhập thành công (không chứa token).
3. **Cloudflare runtime:** `GET /api/drive-client-config` trả Client ID công khai từ `GOOGLE_DRIVE_CLIENT_ID`, rồi `GOOGLE_CLIENT_ID`.
4. **Dự phòng:** Hiện ô nhập thủ công và thông báo lỗi rõ ràng nếu không nguồn nào có ID hợp lệ.

Resolver chạy khi mở Editor, **trước cú nhấp Kết nối Drive**, để trình duyệt không chặn Google Identity Services popup. Nút kết nối bị khóa trong lúc đang tải config hoặc khi ID chưa đúng định dạng. Kết nối không được coi là thành công cho đến khi GIS chấp nhận token; không lưu access/refresh token vào localStorage.

**Không nhất thiết phải thêm `VITE_GOOGLE_CLIENT_ID` nếu Cloudflare runtime đã có `GOOGLE_CLIENT_ID` hợp lệ** (Blogger OAuth). Tuy nhiên biến Vite riêng vẫn là cách ưu tiên ổn định cho các deployment khác và Preview. Hai Client ID có thể khác nhau nếu một OAuth client không được cấp origin hoặc scope Drive; cần xác nhận Authorized JavaScript origins và Google Drive API tại Google Cloud. Runtime endpoint cần hoạt động trên Pages deployment thực tế; local Vite proxy có thể cần backend tương ứng.

Test hồi quy: `node --test apps/web/test/editorDriveClientFallback.test.mjs`, rồi `npm run check && npm run build`.

## 1. Thêm biến vào Cloudflare Pages

1. Mở [Cloudflare Dashboard](https://dash.cloudflare.com/), vào **Workers & Pages** → chọn Pages project **`duynguyen-reddit-editor`**.
2. Mở **Settings** → **Environment variables** (một số giao diện là **Variables and Secrets** → Add).
3. Chọn **Production**, thêm biến kiểu **Text / plaintext**:

   | Name | Value |
   |---|---|
   | `VITE_GOOGLE_CLIENT_ID` | `<CLIENT_ID_THỰC_TẾ>.apps.googleusercontent.com` |

   Thay `<CLIENT_ID_THỰC_TẾ>` bằng đúng **OAuth 2.0 Client ID — Web application** từ [Google Cloud Console / Clients](https://console.cloud.google.com/auth/clients). **Không thêm dấu ngoặc nhọn, dấu nháy hay khoảng trắng**. Đây không phải API key hoặc Client Secret.

4. Nếu muốn test trên các bản **Preview** của Cloudflare, cấu hình cùng biến cho **Preview**. Các môi trường Production/Preview có giá trị riêng.
5. Lưu thay đổi. Vào **Deployments** → **Retry deployment** hoặc **Create deployment** cho commit trên `main` sau khi PR được merge. Chỉ sửa biến **không thay đổi bundle đã build trước đó**.
6. Mở https://duynguyen-reddit-editor.pages.dev/ → **Google Drive · Markdown**. Kết quả cần thấy: dòng báo Client ID đã cấu hình và nút **Kết nối Drive**, **không** còn ô nhập tay. Đăng nhập để cấp quyền Drive.

**Lưu ý về CI/CD:** Repo sử dụng Vite build với `npm run build` tại gốc, đầu ra là `apps/web/dist`. Với Cloudflare Pages **Git integration**, biến cấu hình ở Pages được truyền vào tiến trình build. Nếu thực tế build bundle trên **GitHub Actions** rồi upload artefact lên Cloudflare (Direct Upload), bạn phải truyền `VITE_GOOGLE_CLIENT_ID` vào **bước chạy Vite build trên GitHub Actions** nữa; khai báo biến chỉ ở Cloudflare sẽ không thể sửa bundle đã build ở nơi khác.

## 2. Cấu hình Google Cloud OAuth

Trong cùng Google Cloud project của Client ID:

1. Vào **Google Auth Platform → Clients** → mở Client ID **Web application** đang dùng.
2. Tại **Authorized JavaScript origins**, thêm chính xác:
   - `https://duynguyen-reddit-editor.pages.dev`
   - `http://localhost:5173` nếu cần dùng local.
   - Thêm từng domain custom/preview **cố định** nếu có sử dụng, không dùng wildcard hoặc đường dẫn sau domain.
3. Bật **Google Drive API** và kiểm tra scope `https://www.googleapis.com/auth/drive.file`.
4. Nếu app còn ở **Testing**, bổ sung tài khoản Google đăng nhập vào **Test users**.

Luồng Drive của Editor sử dụng Google Identity Services token popup (khác với callback của Blogger). Không cần thêm redirect URI cho popup Drive chỉ vì dùng Pages.

## 3. Nghiệm thu / xử lý lỗi

- **Vẫn thấy ô nhập tay:** Kiểm tra tên biến chính xác, Production vs Preview, Cloudflare có build lại từ commit đã merge chưa. Mở DevTools và hard refresh nếu cần; không cần xóa `localStorage`.
- **`origin_mismatch`:** Kiểm tra client Web application và thêm đúng origin `https://duynguyen-reddit-editor.pages.dev` trong Google Cloud.
- **`invalid_client` / ID không hợp lệ:** Kiểm tra giá trị `VITE_GOOGLE_CLIENT_ID`, không dùng Client Secret hay placeholder.
- **Drive API 403 / access_denied:** Bật Drive API, scope và Test users; bảo đảm người dùng đồng ý cấp quyền.
- **Build từ GitHub Actions:** Đặt biến vào môi trường build của Actions, không chỉ runtime Pages.
- **Bảo mật:** Client ID có thể xem từ frontend bundle theo thiết kế OAuth; không coi nó là secret. Không commit `.env.local` hoặc đưa Client Secret vào Vite.

## 4. Chạy test

```bash
npm ci
npm run check
npm run build
```

Bộ test `apps/web/test/driveClientId.test.mjs` kiểm tra thứ tự ưu tiên Cloudflare → localStorage, trường hợp môi trường trống và giá trị có khoảng trắng.

**Tài liệu:** [Cloudflare Pages build environment variables](https://developers.cloudflare.com/pages/configuration/build-configuration/#environment-variables), [Cloudflare Variables and Secrets](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables), [Vite env and mode](https://vite.dev/guide/env-and-mode.html), [Google OAuth client JavaScript origins](https://support.google.com/cloud/answer/15549257?hl=en).

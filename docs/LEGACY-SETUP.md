# Duy Nguyen · Reddit-style Blogger Editor

**Mới: Local Editor kết nối Google Drive trực tiếp.** Đã thêm lưu/mở/cập nhật file Markdown, Client ID cục bộ và shortcut một lần nhấp. Xem [lộ trình Google Drive và hướng dẫn cấu hình/kiểm tra](GOOGLE-DRIVE-ROADMAP.md). Chế độ Drive không cần backend hay Client Secret. Hướng dẫn Blogger bên dưới vẫn dành cho luồng Blogger qua backend; thông tin lưu token mã hóa bên dưới chỉ áp dụng cho Blogger. Token Drive nằm trong RAM trình duyệt.


Ứng dụng soạn thảo **React + TipTap + Node.js** cho blog Blogger. Giao diện lấy cảm hứng từ **Create Post** của Reddit: chọn blog trong modal có tìm kiếm, Title, Add tags, Body, Drafts và Publish. Đây không phải ứng dụng do Reddit phát triển hay phê duyệt.

> **Phạm vi bản này:** đăng nhập Google OAuth 2.0, liệt kê blog có quyền truy cập, mở danh sách bài nháp/đã đăng, tạo nháp, lưu và cập nhật nháp theo Post ID, xuất bản có xác nhận, chèn ảnh bằng URL, trình soạn thảo TipTap, HTML/Preview, bản lưu cục bộ. Blogger gốc vẫn là nơi lưu trữ bài và bình luận.

## 1. Yêu cầu

- macOS / Windows / Linux, có **Node.js 22.12+**, `npm` và Internet để cài dependencies.
- Google Cloud project đã bật Blogger API v3; OAuth Client loại **Web application**.
- `Authorized redirect URI` đã thêm **chính xác** `http://localhost:3000/auth/google/callback`.
- `Authorized JavaScript origins`: có thể thêm `http://localhost:5173`. Không bắt buộc đối với luồng OAuth chạy hoàn toàn ở backend.
- OAuth scope `https://www.googleapis.com/auth/blogger` và email quản trị Blogger trong *Test users* (nếu app External / Testing).
- Client ID, Client Secret của bạn. Không chia sẻ Client Secret trong chat/GitHub/theme.

## 2. Chạy trên Mac (copy từng khối)

Giải nén ZIP vào thư mục Downloads. Mở Terminal và chạy:

```bash
cd "$HOME/Downloads/DuyNguyen-Reddit-Blogger-Editor"
cp apps/server/.env.example apps/server/.env
openssl rand -hex 32
```

Sao chép chuỗi ngẫu nhiên dài 64 ký tự ở dòng cuối. Mở file cấu hình bằng TextEdit:

```bash
open -e apps/server/.env
```

Điền các dòng **trên máy bạn**:

```dotenv
GOOGLE_CLIENT_ID=<Client ID từ Google Cloud>
GOOGLE_CLIENT_SECRET=<Client Secret từ Google Cloud>
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
FRONTEND_ORIGIN=http://localhost:5173
EDITOR_BIND_HOST=localhost
PORT=3000
BLOGGER_BLOG_ID=1346670730934460908
APP_SECRET=<chuỗi 64 ký tự từ openssl rand -hex 32>
COOKIE_SECURE=false
```

Đảm bảo không để cặp ký tự `< >` ở giá trị thực tế. Sau đó:

```bash
npm install
npm run dev
```

Mở **http://localhost:5173**. Nhấn **Kết nối Google** → chọn tài khoản quản lý Blogger → đồng ý quyền Blogger → quay lại editor. Tiếp theo:

1. Nhấn **Select Blog**, chọn blog (nếu có nhiều blog).
2. Nhập Title, nhấn **Add tags** nếu cần, viết Body.
3. Nhấn **Save draft** để tạo bài nháp đầu tiên trên Blogger.
4. Khi đã có Post ID, các lần sửa tiếp theo tự đồng bộ sau khoảng 5 giây **trong chế độ Compose** (nếu bật Auto-save).
5. Mở **Drafts** để đọc lại bản nháp từ Blogger; mở các bài đã đăng ở chế độ chỉ xem để tránh sửa nhầm.
6. Nhấn **Publish** và xác nhận nếu muốn đưa bài viết lên blog công khai.

**Cực kỳ quan trọng:** Khi mới tạo bài, hệ thống chỉ có bản lưu cục bộ, chưa có bản nháp trên Google. Bạn phải bấm **Save draft** một lần. Khi nút Publish bị vô hiệu hóa, nghĩa là bài chưa được lưu lên Blogger hoặc không phải bản nháp.

## 3. Tạo bản build

```bash
npm run build
npm start
```

Sau khi build, backend Node.js phục vụ giao diện trực tiếp tại **http://localhost:3000**. Tuy nhiên, nếu bạn muốn sử dụng trên cổng 3000 thay vì Vite 5173, hãy đổi `FRONTEND_ORIGIN=http://localhost:3000` trong `.env`. Giữ callback OAuth ở `http://localhost:3000/auth/google/callback`.

> **Không đưa bản localhost này lên Internet công khai.** Để deploy thật cần HTTPS, cookie Secure, reverse proxy đáng tin cậy, session store phù hợp và cấu hình OAuth Production.

## 4. An toàn dữ liệu và giới hạn

- **Không tự xuất bản:** chỉ Publish khi nhấn nút và xác nhận. Trước Publish, ứng dụng kiểm tra timestamp bản nháp nhằm hạn chế ghi đè do chỉnh sửa ở nơi khác.
- Token được mã hóa AES-256-GCM thành `apps/server/data/sessions.enc`, sử dụng `APP_SECRET`; không có token trong LocalStorage hoặc React bundle.
- `apps/server/.env` và file token đã được loại trừ bởi `.gitignore`. Đừng commit hai file này, kể cả GitHub private.
- Mỗi phiên OAuth dùng state và PKCE; POST/PATCH dùng CSRF và kiểm tra Origin.
- **Nội dung của HTML view:** khi lưu, backend lọc HTML không an toàn. Chuyển từ HTML view sang Compose có thể làm mất một số thẻ không được TipTap hỗ trợ. Hãy cân nhắc giữ nguyên HTML view với bài cũ có iframe/embed tùy biến.
- **Chèn ảnh:** nhập URL ảnh công khai. Blogger API v3 không cung cấp endpoint upload hình trực tiếp như bài đăng; ứng dụng chưa xử lý upload ảnh.
- **Google OAuth Testing:** refresh token có thể hết hiệu lực sau khoảng 7 ngày. Khi đó kết nối lại (hoặc xét cấu hình Production theo yêu cầu Google).
- **Lưu cục bộ:** để cứu nháp khi mất mạng, ứng dụng lưu bản đang viết bằng localStorage trong trình duyệt đang dùng. Không sử dụng trên máy công cộng cho nội dung nhạy cảm.
- **Thư viện npm:** bộ ZIP chứa mã nguồn, không chứa `node_modules` hoặc thông tin đăng nhập. Cần `npm install` có mạng trên máy bạn.
- **Cookie:** cấu hình mặc định dành cho `localhost` (HTTP). Khi triển khai HTTPS cần `COOKIE_SECURE=true` và điều chỉnh `GOOGLE_REDIRECT_URI`, `FRONTEND_ORIGIN` đồng nhất theo URL thực tế.
- `BLOGGER_BLOG_ID` mặc định hạn chế thao tác vào blog `1346670730934460908` để giảm rủi ro chọn nhầm blog.

## 5. Kiểm tra mã nguồn

```bash
npm test
npm run build
```

Kiểm thử gồm bộ hàm mã hóa phiên, PKCE, xác thực payload và luồng Blogger API với các phản hồi Google giả lập; các test không tự tạo bài thật.

## 6. Gỡ kết nối

Chọn **Ngắt kết nối** để xóa phiên trên server. Bạn cũng có thể vào **Google Account → Security → Third-party connections** để thu hồi quyền đã cấp. Muốn xóa toàn bộ phiên cục bộ: dừng server, xóa `apps/server/data/sessions.enc`. Không xóa `APP_SECRET` nếu vẫn muốn đọc lại phiên cũ.

## 7. Xử lý lỗi

| Dấu hiệu | Cách khắc phục |
|---|---|
| `redirect_uri_mismatch` | Kiểm tra Google Cloud URI phải đúng `http://localhost:3000/auth/google/callback` (không dấu `/` thừa). |
| `Access blocked / app is testing` | Thêm email Blogger của bạn vào Google Auth Platform → Audience → Test users. |
| `Blogger API: insufficient permissions` | Bật Blogger API v3, kiểm tra đúng Google account và scope Blogger; kết nối Google lại. |
| `Blogger API: Request contains an invalid argument.` và không thấy blog | Đã xác nhận `GET /users/self/blogs?view=ADMIN` trả HTTP 400 với phiên thật; bỏ `view` trả HTTP 200 và 4 blog. Bản sửa để Google chọn quyền mặc định khi liệt kê blog. Kiểm tra đang chạy đúng thư mục đã sửa, rồi khởi động lại backend. |
| `Không kết nối được backend` | Kiểm tra terminal `npm run dev`, cổng 3000 và file `.env`. |
| `409 - Bản nháp đã được thay đổi` | Không ghi đè. Mở Drafts → mở lại bài từ Google, đối chiếu trước khi lưu. |
| `npm install` lỗi | Kiểm tra Internet, Node ≥22.12, proxy/network tới registry npm. |
| `Bài chưa xuất hiện` | Xem tab **Bản nháp** của Blogger; Publish là bước riêng, không phải Save draft. |

**Lưu ý về tham số Blogger:** [schema Discovery hiện tại của Google](https://www.googleapis.com/discovery/v1/apis/blogger/v3/rest) khai báo enum chữ hoa cho `posts.list`. Backend dùng `DRAFT/LIVE` và `UPDATED` theo schema đó. Tuy nhiên, kiểm tra thật cho thấy Google cũng chấp nhận `draft/updated`: chữ thường không phải nguyên nhân của lỗi danh sách blog. `view=ADMIN` vẫn hoạt động khi lấy bài, nên chỉ bỏ tham số này tại `blogs.listByUser`. Các probe chỉ đọc dữ liệu, không tạo hoặc xuất bản bài.

## 8. Cấu trúc thư mục

```text
apps/
  server/
    index.mjs          # HTTP API, OAuth, Blogger API
    lib.mjs            # validation + crypto
    .env.example       # cấu hình mẫu (không chứa secret)
    test/              # test Node
    data/              # encrypted sessions (không commit)
  web/
    src/App.jsx        # editor Reddit-inspired
    src/style.css      # responsive UI
    src/Callout.js     # TipTap callout
    src/api.js         # fetch API nội bộ
scripts/dev.mjs        # chạy đồng thời backend + Vite
```

---

Ứng dụng này kết nối **Blogger** và không yêu cầu Reddit API / tài khoản Reddit. Bình luận Blogger không bị thay đổi. Upvote Apps Script là hệ thống độc lập trên theme, không liên quan tới editor này.

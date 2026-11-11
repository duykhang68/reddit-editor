# GA4 Insights — cấu hình và sử dụng

Trang: `https://duynguyen-reddit-editor.pages.dev/ga4-insights/`

## Nguồn dữ liệu

- GA4 Property ID: `563038949`
- Web Stream ID: `16289663503`
- Measurement ID: `G-Z83BHS8KMY`
- Blog: `https://duynguyen99.blogspot.com`
- Service account được cấp quyền: `blognaver-articlepdf@blognaver-automation-article.iam.gserviceaccount.com`

Dashboard đọc trực tiếp Google Analytics Data API, **không sử dụng Measurement ID để truy vấn báo cáo**. Hệ thống chỉ thống kê đúng stream trên bằng bộ lọc `streamId`. GA4 có thể trì hoãn tổng hợp số liệu. Khi API lỗi, dashboard sẽ báo lỗi, **không hiển thị dữ liệu demo**.

## Cấu hình Cloudflare Pages (Production)

1. Mở Cloudflare → Workers & Pages → dự án `duynguyen-reddit-editor` → **Settings → Variables and Secrets** (vị trí menu có thể khác tùy giao diện).
2. Thêm **secret** `GA4_SERVICE_ACCOUNT_JSON`: dán **toàn bộ nội dung JSON private key** của *đúng* service account nêu trên. Không đưa private key lên GitHub, Vite `VITE_*`, hoặc mã frontend. Nếu key đã có sẵn dưới tên secret khác, sao chép giá trị từ nơi bảo mật hoặc điều chỉnh binding ở backend, không công khai key.
3. Thêm **secret** `GA4_INSIGHTS_ACCESS_KEY`: chuỗi ngẫu nhiên dài ít nhất 32 ký tự mà chỉ bạn biết; dùng như mật khẩu xem dashboard. Trang **không lưu mã này lên localStorage**.
4. Trong Google Cloud project sở hữu service account, bật **Google Analytics Data API** (`analyticsdata.googleapis.com`). Đảm bảo email service account đã được cấp vai trò Viewer hoặc Analyst trở lên tại Property access management của Property `563038949`.
5. **Redeploy** Cloudflare Pages sau khi thiết lập secrets để Function nhận biến. Cấu hình riêng cho Preview nếu cần thử ở môi trường Preview.
6. Mở đường dẫn dashboard, nhập mã truy cập, nhấn **Xem dữ liệu GA4**. Chọn 7/30/90 ngày, nhấn **Làm mới** để lấy báo cáo mới.

**Lưu ý:** Chỉ chia sẻ access key với người được phép xem lưu lượng blog; không sử dụng Measurement ID làm access key. Nếu dashboard báo `GA4_NOT_CONFIGURED`, thiếu service account JSON; `GA4_UNAUTHORIZED`, mã truy cập sai; `GA4_PERMISSION_DENIED`, API hoặc quyền truy cập Google cần kiểm tra. Không cần thêm mã theo dõi GA4 lên blog vì bạn đã thấy data trong báo cáo gốc.

## Kiến trúc và quyền riêng tư

- UI: `apps/web/public/ga4-insights/index.html` (light mode, mở riêng với Editor).
- Cloudflare Pages Function: `apps/web/functions/api/ga4-insights.js` (GET, chỉ đọc, không đổi dữ liệu GA4).
- JWT RS256 được ký **trên server** bằng service-account private key rồi đổi lấy access token ngắn hạn qua Google OAuth token endpoint. Chỉ `analytics.readonly`.
- Mỗi lần refresh thực hiện 1 lần lấy access token, 6 báo cáo lịch sử và 1 báo cáo realtime. Không tự poll liên tục nhằm hạn chế quota.
- API yêu cầu `x-dashboard-key` khớp secret cấu hình, không có mã cấu hình sẽ fail-closed với HTTP 503; dữ liệu không public.
- Các bảng trang, nguồn truy cập, thiết bị và quốc gia sử dụng dữ liệu thực từ Google. Các phép hiển thị trực quan chỉ tính trên số liệu được trả về.
- Shortcut được thêm vào danh sách `EDITOR_QUICK_LINKS` trong `apps/web/src/App.jsx` để tìm ở mục **Truy cập nhanh**.

## Kiểm thử sau deploy

1. Không nhập mã hoặc nhập sai phải bị từ chối với HTTP 401; thiếu cấu hình bảo vệ phải từ chối với 503.
2. Nhập mã đúng nhưng thiếu JSON → thấy `GA4_NOT_CONFIGURED`; không hiển thị số liệu fake.
3. Khi có quyền Google hợp lệ, kiểm tra 7 ngày, 30 ngày, 90 ngày. Đối chiếu active users, sessions, screenPageViews với GA4 Reports cho cùng stream và ngày.
4. Kiểm tra realtime 30 phút riêng, không gộp với users của 30 ngày.
5. Kiểm tra liên kết nhanh ở trang chủ Editor và bố cục mobile.

## Quy tắc triển khai

Không lưu Google credential trong frontend hay GitHub. Không ghi đè các shortcut hiện có. Mọi thay đổi phải qua Quality Gate trước khi merge.

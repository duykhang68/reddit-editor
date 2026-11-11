# Zero-overage policy — DuyNguyen Editor

## Giới hạn **cứng** ở nhà cung cấp, không phải JavaScript

- Duy trì **Cloudflare Workers Free** và **Cloudflare Pages Free**; không nâng cấp sang Paid hoặc kích hoạt dịch vụ tính phí theo mức dùng.
- Workers Free hiện giới hạn **100.000 requests/ngày trên toàn account** (reset 00:00 UTC), và vượt giới hạn có lỗi **1027**; chọn **Fail closed**, tuyệt đối không dùng Fail open/bypass Function.
- Pages Free hiện giới hạn **500 builds/tháng trên toàn account**. Kiểm tra Builds trong dashboard; code trong repository không thể đặt một bộ đếm tuyệt đối cho các build Cloudflare.
- Giữ `apps/web/public/_routes.json` giới hạn Functions chỉ cho `/api/*`, `/auth/*`; tài nguyên tĩnh không cần Functions.
- Giữ Google Cloud project không liên kết các dịch vụ có billing tự động. Nếu có billing account, kiểm tra thủ công từng sản phẩm và đặt hard caps ở nơi nhà cung cấp hỗ trợ. Google Cloud **budget alert không phải hard stop**.
- Kiểm tra Google Blogger API Quotas trong Google Cloud Console và đặt hạn mức thấp hơn quota miễn phí ở nơi cho phép. Khi Google trả lỗi quota, chức năng API sẽ dừng và trả HTTP 429.

## Giới hạn trong code (lớp bảo vệ bổ sung)

- Tối đa **4 HTTP fetch ra ngoài cho mỗi HTTP request** (bao gồm Google OAuth token và Blogger API), vượt ngưỡng trả HTTP 429 trước khi phát sinh fetch tiếp theo.
- Khi Google báo 429 hoặc 403 có reason quota/rate-limit, trả HTTP 429 với `Retry-After`, **không tự retry**.
- Giữ timeout 15 giây cho mỗi fetch. Không thêm polling tự động hoặc vòng lặp retry vô hạn.

**Quan trọng:** Giới hạn theo từng request không phải tổng quota/ngày; trình duyệt có thể gửi nhiều request, và Pages Function không có state bền vững để đếm tổng chính xác. Vì thế không thể cam kết hóa đơn bằng 0 chỉ từ code. Muốn hard cap 100% trên mọi khu vực phải dùng kiểm soát ở cấp tài khoản/provider hoặc counter nhất quán toàn cục (mà có thể yêu cầu dịch vụ riêng). 

## Sau deploy

```bash
npm test && npm run build
curl -i https://duynguyen-reddit-editor.pages.dev/api/health
```

Không công khai `Set-Cookie`, Google OAuth code/state, `APP_SECRET`, `GOOGLE_CLIENT_SECRET`.

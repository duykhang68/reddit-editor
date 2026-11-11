# Daily Expenses — Cloudflare D1 sync (3 phút)

Trang: https://duynguyen-reddit-editor.pages.dev/expenses/

## Trạng thái chức năng

Sau khi cấu hình D1, giao dịch, ngân sách tháng và danh mục tùy chỉnh được sao lưu theo tài khoản Google Blogger đang đăng nhập. Dữ liệu được ghi ngay vào localStorage, sau đó đồng bộ lên Cloudflare D1 theo chu kỳ 180 giây **khi trang đang mở**, hoặc 12 giây sau lần nhập/sửa (debounce). Có nút **Đồng bộ ngay** và trạng thái/thời điểm đồng bộ được server xác nhận.

**Quan trọng:** Khi trình duyệt đóng, trang không thể gửi những chỉnh sửa local chưa upload. Mọi bản đã upload thành công vẫn được lưu tại Cloudflare. Nếu chưa cài binding, trang chỉ lưu local và không báo đã đồng bộ.

## Bước cấu hình bắt buộc trong Cloudflare

1. Đăng nhập Cloudflare Dashboard, tạo **D1 SQL Database** tên ví dụ: duynguyen-expenses.
2. Vào **Workers & Pages → Pages project duynguyen-reddit-editor → Settings → Bindings → Add binding → D1 database**.
3. Chọn đúng database vừa tạo và đặt **Variable name: EXPENSES_DB** (phân biệt chữ hoa/thường).
4. Lưu và **Redeploy production** để binding có hiệu lực. Nếu cần Preview, cấu hình binding riêng ở môi trường Preview.
5. Truy cập /expenses/, bấm **Kết nối Google** nếu chưa đăng nhập. Sau đó bấm **Đồng bộ ngay**.
6. Chỉ xác nhận thành công khi trang hiển thị **Đã lưu Cloudflare** và timestamp từ server.

Backend tự chạy CREATE TABLE IF NOT EXISTS cho bảng expenses_snapshots ở lần truy cập đầu tiên; không yêu cầu tự chạy SQL thủ công. Cloudflare D1 chưa cấu hình trả lỗi 503, code EXPENSES_DB_MISSING.

Hướng dẫn chính thức: https://developers.cloudflare.com/pages/functions/bindings/#d1-databases

## Bảo mật và tránh ghi đè

- Cookie phiên Google OAuth đã có của Editor được dùng để xác thực. Server gọi Blogger API users/self để lấy ID chủ sở hữu, không tin owner ID do trình duyệt truyền lên.
- Mỗi chủ sở hữu có một snapshot trong D1; GET/PUT chỉ thao tác với ID đã xác thực.
- Ghi dữ liệu yêu cầu CSRF và Origin hợp lệ; kiểm tra schema, kích thước và revision.
- Số phiên bản revision được so sánh atomically trước khi ghi: cập nhật từ thiết bị khác sẽ trả HTTP 409.
- Nếu cloud/local khác nhau và không có điểm chung xác minh, UI hiển thị xung đột, KHÔNG tự ghi đè. Khi người dùng chủ động chọn bên giữ lại, ứng dụng tải JSON backup của bên bị thay thế.
- Chỉ một phía thay đổi sau lần đồng bộ trước: tự tải về hoặc đẩy lên đúng phía. Thiết bị mới không có dữ liệu sẽ khôi phục cloud.
- Bộ nhớ local có các key dn-daily-expenses-v1 và dn-daily-expenses-cloud-sync-v1.
- Không đưa giao dịch lên GitHub hoặc frontend public; không để credentials D1 trong JavaScript.
- Snapshot D1 giới hạn 1,5 MB/owner do giới hạn dung lượng mỗi hàng của D1. Nếu vượt, giữ local và thông báo lỗi; xuất JSON định kỳ để dự phòng.

## Mã nguồn

- apps/web/src/expenses/cloudStore.mjs — kiểm tra và lưu D1, CAS theo revision
- apps/web/functions/[[path]].js — GET/PUT /api/expenses-state, xác thực, CSRF, OAuth return
- apps/web/src/expenses/cloudSync.js — thuật toán so sánh và conflict
- apps/web/src/expenses/useExpenseCloudSync.js — auto mỗi 180 giây, manual, backup JSON
- apps/web/src/expenses/Expenses.jsx — trạng thái, nút đồng bộ, xử lý conflict
- apps/web/src/expenses/cloudSync.css — giao diện Reddit OrangeRed
- apps/web/test/expensesCloudSync.test.mjs — kiểm thử bảo mật, conflict, và thời gian

## Kiểm thử

1. Chưa binding: giao diện cảnh báo, không báo thành công giả.
2. Sau khi tạo binding, nhập 1 khoản rồi bấm Đồng bộ ngay, thấy timestamp xác nhận.
3. Đăng nhập cùng Google Blogger trên trình duyệt/thiết bị khác, tải bản cloud.
4. Thử chỉnh sửa trên hai thiết bị trước khi sync, phải hiện conflict thay vì ghi đè.
5. Mất mạng vẫn nhập được tại máy; khi mạng trở lại đồng bộ lại.
6. Chạy npm run check và npm run build, theo dõi GitHub Actions trước khi merge.

Không có Cloudflare D1 binding từ trước thì việc merge code và auto deploy không tự tạo cơ sở dữ liệu cho bạn. Sau khi cấu hình một lần, các lần deploy sau dùng binding đó.

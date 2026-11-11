# Starbucks Rewards & Insights — Google Drive Sync

## Mục tiêu
Trang `/starbucks-insights/` dùng cùng quy trình OAuth Google Drive với `/expenses/`, **không chia sẻ file dữ liệu Starbucks và Expenses**. Giao diện Reddit Light tông trắng / cam, không sửa layout hoặc chức năng OCR/form hiện có.

## Cách sử dụng
1. Truy cập `https://duynguyen-reddit-editor.pages.dev/starbucks-insights/`.
2. Bấm **Kết nối Google Drive**, chọn đúng tài khoản và chấp nhận quyền `drive.file`. Nếu đã cấu hình `VITE_GOOGLE_CLIENT_ID` trên Cloudflare Pages, không cần nhập Client ID thủ công. Có thể dùng Client ID mà Editor ghi nhớ hoặc fallback công khai từ `/api/drive-client-config`.
3. Bấm **Đồng bộ ngay** để sao lưu/đối chiếu theo yêu cầu; khi giữ trang mở và token còn hợp lệ, ứng dụng tự kiểm tra mỗi **3 phút**. Sau khi chỉnh sửa giao dịch cũng có lượt kiểm tra trễ 12 giây.
4. Trên thiết bị mới, kết nối **cùng tài khoản Drive**, hệ thống tải snapshot gần nhất khi local chưa có dữ liệu. Nếu hai bên có dữ liệu độc lập, UI yêu cầu chọn một bản, không tự ghi đè.
5. Khi có xung đột, chọn **Sao lưu local & khôi phục Drive** hoặc **Sao lưu Drive & dùng bản local**. Trước khi thay thế, trình duyệt tải JSON của bản được thay thế. Bản cũ trên Drive vẫn giữ vì cơ chế snapshot chỉ thêm mới.

## Dữ liệu được sao lưu
- `transactions` tối đa 20.000 giao dịch, đầy đủ `id`, ngày, cửa hàng, món, `orderId`, `baseAmount`, `extraAmount`, `extraReason`, `discountAmount`, `discountReason`, `amount`, phí, số ly, thanh toán và cờ điều kiện nhận sao.
- `config`: ngày bắt đầu chu kỳ, Green/Gold, điều chỉnh Stars xét hạng/đổi thưởng và Stars đã dùng.
- JSON nhận dạng `kind=duynguyen-starbucks-snapshot-v1`; metadata Drive `appProperties.dn_starbucks=snapshot_v1`. Không sử dụng `dn_expenses`, không ghi đè snapshot Expenses.
- Tên file `DuyNguyen-Starbucks-<timestamp>-<id>.json`. File chỉ tải lên Drive sau khi đăng nhập/cấp quyền và qua kiểm tra định dạng, giới hạn 4 MB.
- Dữ liệu vẫn lưu trên trình duyệt qua `dn-starbucks-insights-v1`. Metadata đồng bộ riêng: `dn-starbucks-drive-sync-v1`.

## Cơ chế an toàn
- OAuth access token chỉ tồn tại trong bộ nhớ, không ghi token/Client Secret vào localStorage.
- Mỗi lần đồng bộ đối chiếu hash dữ liệu chuẩn hóa, chủ tài khoản Drive, ID snapshot gần nhất và đường tổ tiên. Không tải bản khác/ghi đè khi phát hiện hai nhánh thay đổi; trường hợp đó hiện yêu cầu xử lý xung đột.
- Snapshot bất biến (append-only), lưu `base_id`; file mới được tải xuống đọc lại và so sánh nội dung trước khi báo đồng bộ thành công.
- Nếu local thay đổi trong lúc kiểm tra Drive, không đánh dấu là đã đồng bộ phiên bản mới.
- Nếu phiên OAuth hết hạn, ứng dụng giữ local và yêu cầu kết nối lại. **Không hứa chạy nền khi đóng tab**; nhắc người dùng export JSON nếu có chỉnh sửa chưa sao lưu.

## Cấu hình Cloudflare Pages
`Settings → Environment Variables`: `VITE_GOOGLE_CLIENT_ID=<Web OAuth Client ID>.apps.googleusercontent.com` (build-time), sau đó deploy lại. Trên Google Cloud bật Google Drive API, thêm JavaScript origin `https://duynguyen-reddit-editor.pages.dev`, chọn scope `https://www.googleapis.com/auth/drive.file`.

## Kiểm thử
- `node --test apps/web/test/starbucksDriveSync.test.mjs`
- `node --test apps/web/test/starbucksInsights.test.mjs apps/web/test/expensesDriveSync.test.mjs`
- `cd apps/web && npm run build`
- Test hành vi với 2 thiết bị: local trống -> pull; đã đồng bộ -> push; sửa đồng thời -> conflict; thay tài khoản -> conflict; xác nhận dữ liệu Expenses không xuất hiện trong file Starbucks.

## Tệp thay đổi
- `apps/web/src/starbucks-insights/{StarbucksInsights.jsx,starbucks.css,driveSync.js,useStarbucksDriveSync.js}`
- `apps/web/src/services/googleDriveService.js`
- `apps/web/starbucks-insights/index.html`
- `apps/web/test/starbucksDriveSync.test.mjs`

> Lưu ý: Google Drive chỉ được đồng bộ khi người dùng đã kết nối Google OAuth. Hãy mở file backup được liên kết trên UI để kiểm tra dữ liệu thực tế sau lần đồng bộ đầu tiên.

# Highlands Rewards & Insights — triển khai 07/11/2026

- **URL:** `/highlands-insights/` (Cloudflare Pages: `https://duynguyen-reddit-editor.pages.dev/highlands-insights/`)
- **Repository:** `duykhang68/tetdinhmuiblog`
- **Nhánh:** `feat/highlands-rewards-insights-20261107`
- **Nguồn:** [Chính sách HighlandsĐI cập nhật 24/08/2026](https://www.highlandscoffee.com.vn/vn/chinh-sach-chuong-trinh-thanh-vien-highlandsdi.html).

## Kiến trúc và phạm vi
- Trang React + Vite multi-page độc lập: `apps/web/highlands-insights/index.html`, `apps/web/src/highlands-insights/`.
- Dashboard sáng theo concept Starbucks Insights, dùng neutral Reddit + accent đỏ Highlands; **Thực trả** có màu xanh lá, **Giảm giá** đỏ, giữ 3 thẻ đối soát dễ đọc.
- Form giao dịch, phân tách giá gốc/phụ thu/giảm/thực trả, lý do ưu đãi, phương thức Payoo/POS, số món, mã Check, ngày/giờ/cửa hàng, sửa/xóa, thống kê tháng, lọc, CSV, JSON.
- OCR **riêng cho hóa đơn nhiệt Highlands**: `receiptOcr.js` (thành tiền/tổng tiền/Payoo, Check, ngày, tên món xuống dòng như 510ml), `receiptOcrBrowser.js` (Tesseract vie+eng; xử lý grayscale/contrast khi lần đầu chưa đủ rõ); OCR ngay trong trình duyệt, không gửi ảnh lên server, không tự lưu giao dịch.
- Dữ liệu lưu `localStorage` riêng `dn-highlands-insights-v1`; Google Drive tùy chọn dùng scope `drive.file`, snapshot append-only gắn tag `dn_highlands`, metadata `dn-highlands-drive-sync-v1`. Tuyệt đối không trộn dữ liệu với Starbucks (`dn_starbucks`) hay Expenses (`dn_expenses`). Sau khi kết nối, tự đồng bộ mỗi **3 phút khi trang đang mở**, có nút đồng bộ thủ công và xử lý conflict an toàn.
- Editor quick link trong `EDITOR_QUICK_LINKS`; Vite cấu hình entry `highlandsInsights` riêng.

## Kiểm thử hóa đơn Bàu Bàng người dùng cung cấp
| Trường | Giá trị |
| --- | --- |
| Ngày/giờ | 03/11/2026 17:45 |
| Cửa hàng | KCN Bàu Bàng |
| Check | 139154 |
| Bánh Tiramisu | 39.000đ |
| Nước tinh khiết Dasani 510ml | 15.000đ |
| Tổng món | 2 |
| Thành tiền / Tổng tiền / Payoo Bank Card | **54.000đ**, chỉ tính **một lần** |
| DRIPS tiềm năng nếu đủ điều kiện và xác nhận thành viên | 5 |
| TemĐI tiềm năng nếu đủ điều kiện và xác nhận thành viên | 1 |

Ảnh giấy POS **không chứng minh giao dịch đã được gắn tài khoản HighlandsĐI**. Vì vậy checkbox `Đã quét/xác nhận tài khoản HighlandsĐI` mặc định tắt. DRIPS thực tế chỉ do ứng dụng Highlands xác nhận; không tự tạo giao dịch thật hay khai báo điểm thực tế.

## Quy tắc HighlandsĐI dùng trong dashboard
- Theo chính sách cập nhật **24/08/2026**, điểm DRIPS được tích theo **1 DRIP / 10.000đ thực trả đủ điều kiện**, làm tròn xuống phần 10.000đ gần nhất. Không tính giao dịch nạp thẻ.
- Một giao dịch đủ điều kiện từ **50.000đ** có thể nhận **1 TemĐI**; 9 tem đủ điều kiện để nhận coupon tùy điều khoản.
- Ngưỡng chi tiêu thành viên trong chu kỳ 12 tháng: **Gold dưới 3 triệu, Platinum từ 3 triệu tới dưới 10 triệu, Black từ 10 triệu**. Chính sách công bố có một số lỗi diễn đạt về tên hạng; dashboard sử dụng đúng bảng mốc và ghi **ước tính**, người dùng đối soát với ứng dụng thật.
- Hết hạn DRIPS: sau 12 tháng không tích/dùng điểm. Dashboard không tự xóa số liệu và không tự mô phỏng quyền lợi không xác minh.
- `POLICY_EFFECTIVE_DATE='2026-08-24'` là mốc thận trọng để không hồi tố công thức từ chính sách hiện tại cho giao dịch trước lần cập nhật công bố; không khẳng định đây là ngày đầu HighlandsĐI vận hành.

## Bảo đảm khi phát hành
- Một tính năng = một nhánh và một PR.
- Chạy `npm run check`, `npm test`, `npm run build`; dùng CI trên PR để xác nhận.
- Người dùng vẫn kiểm tra kết quả OCR thực tế trước khi bấm **Thêm giao dịch**.
- Kiểm thử trực tiếp ảnh trên Chrome sau Cloudflare deploy vẫn cần đối soát riêng vì OCR phụ thuộc ánh sáng, góc chụp và chất lượng giấy in.

## Hotfix OCR giấy in nhiệt trên ảnh thật — 07/11/2026

- **Triệu chứng:** Ảnh hóa đơn Highlands giấy in nhiệt trả về `Không tìm thấy dữ liệu hóa đơn Highlands trong ảnh này` mặc dù có Check, ngày, các món và tổng tiền.
- **Nguyên nhân:** Parser cũ dùng logo `HIGHLANDS COFFEE` như cổng chặn tuyệt đối; với ảnh nền gỗ và chữ mảnh OCR có thể đọc nhầm `HAAS COFFE`. Các trường bị bỏ hết dù OCR vẫn giữ được `ShopID: 30799`, `Check: 139154`, `03-11-2026 17:45`, `Payoo Bank Card 54,000`. Nhãn `Tổng tiền` có thể bị đọc thành `Tong tien: 400) SS`.
- **Parser:** Logo chỉ là một trong nhiều tín hiệu. Nếu không có logo nhưng có ít nhất hai dấu hiệu POS như ShopID, Check, Hóa đơn thanh toán, Payoo hoặc Tổng tiền, giữ thông tin đã nhận diện cùng cảnh báo cần kiểm tra. Hóa đơn thương hiệu khác có tên rõ ràng vẫn bị từ chối.
- **Tiền:** Có fallback lấy **54.000đ** từ dòng `Payoo Bank Card` được gắn nhãn rõ khi nhãn Tổng tiền OCR hỏng. Không lấy tiền từ bất kỳ dòng QR, mã máy hoặc số điện thoại. Nếu thiếu một phần chi tiết món, giá gốc có thể được suy ra từ tổng tiền khi chưa có dấu hiệu phụ thu, giảm giá hoặc phí; ghi cảnh báo rõ là khoản suy ra và cần kiểm tra thủ công; không tự bịa giá từng món.
- **Ảnh:** Sau lượt Tesseract gốc, có thể tự tìm vùng giấy sáng độ bão hòa thấp trên nền gỗ, tạo crop, tăng tương phản và đọc lại phần trên hoặc toàn bộ giấy; chọn văn bản có nhiều trường có thể đối soát, không chỉ chọn theo confidence.
- **UX:** Nếu cả ba lượt không tìm ra trường đáng tin cậy, vẫn hiển thị văn bản OCR thô và cảnh báo; không còn báo lỗi chung rồi vứt mất bản OCR. Không tự lưu giao dịch. Không gửi ảnh lên máy chủ.
- **Kiểm thử:** Thêm ca kiểm thử từ một lượt nhận dạng thật của ảnh đính kèm (logo `HAAS COFFE`, tổng `Tong tien: 400) SS`, Payoo `54,000 —= .`), cùng ca logo tách chữ, giá món xuống dòng, nhãn không rõ và trường hợp tài liệu không phải Highlands.
- **Giới hạn:** Tên món/giá món quá mờ có thể vẫn cần người dùng chỉnh lại. Bản CI chỉ kiểm thử parser bằng văn bản nhận diện đã lấy từ ảnh; không thay thế kiểm thử thực tế trên Chrome sau deploy.

## Hotfix độ chính xác cửa hàng OCR — 07/11/2026

- Phản hồi thực tế: parser kiểm thử với văn bản mẫu trả về `KCN Bau Bang`, nhưng OCR trong trình duyệt có thể nhận sai vùng cửa hàng thành chuỗi như `KCN B -p13+ van >`. Điều này phân biệt lỗi nhận dạng ảnh của Tesseract với lỗi phân tích các dòng văn bản đã đọc.
- Thêm bước OCR **riêng vùng tiêu đề + ShopID**, ngoài OCR ảnh gốc và vùng món/tiền. Các lượt OCR được **đối soát theo từng trường**: ví dụ Check/ngày/Payoo được giữ từ ảnh gốc, còn cửa hàng/ShopID được dùng từ ảnh tiêu đề. Hiển thị toàn bộ các bản văn OCR cho người dùng đối chiếu, không tự ghi giao dịch.
- Dữ liệu từ hóa đơn người dùng đã xác nhận: `ShopID: 30799` tương ứng `KCN Bau Bang`. Khi nhận được ShopID này và có bằng chứng hóa đơn Highlands/POS hợp lệ, trường cửa hàng có thể chuẩn hóa thành đúng `KCN Bau Bang`, **không áp dụng tùy tiện** cho các mã khác. Hiển thị cảnh báo nguồn chuẩn hóa từ ShopID.
- Nếu OCR đọc ra **hai ShopID khác nhau**, cảnh báo rõ để kiểm tra; không khẳng định chắc chắn cửa hàng. Nếu không đọc được ShopID, giữ chuỗi OCR để người dùng chỉnh thủ công.
- Đặc biệt: một lượt chỉ gồm header `HAAS COFFE / KCN Bau Bang / ShopID 30799` chưa đủ dấu hiệu POS để parser độc lập chấp nhận, nhưng có thể cung cấp mã cửa hàng cho kết quả OCR thân hóa đơn đã nhận diện hợp lệ.
- Bổ sung test cho tên cửa hàng bị méo, ShopID đúng/sai, hợp nhất header và body, mâu thuẫn mã cửa hàng, UI hiển thị OCR thô từng lượt. CI chỉ xác nhận parser, mã và build; chất lượng Tesseract thực tế phải kiểm tra lại bằng cùng ảnh trên Chrome sau deploy.

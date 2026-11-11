# Payroll & C&B Insights · Hướng dẫn triển khai

**Ngày:** 07/11/2026 · **URL:** `https://duynguyen-reddit-editor.pages.dev/payroll-insights/` · **Repository:** `duykhang68/tetdinhmuiblog`

## Kiến trúc
- Trang Vite React riêng `apps/web/payroll-insights/index.html` và `apps/web/src/payroll-insights/`; shortcut trên Editor `EDITOR_QUICK_LINKS`.
- Phong cách Reddit Light, **không có dark mode**, độc lập hoàn toàn với Editor, Starbucks, Highlands.
- **Không lưu dữ liệu lương vào localStorage và không tự upload**. Tài liệu PDF giữ trong `File` của tab, hiển thị bằng object URL trong trình xem PDF gốc; đóng trang mất dữ liệu của phiên xem (an toàn theo mặc định).
- **Chỉ có client side processing**: PDF.js 3.11.174 tải theo URL pinned từ Cloudflare CDN, Tesseract.js 7.0.0 tải theo URL pinned jsDelivr khi cần OCR. Những thư viện tải từ bên thứ ba chạy trong trình duyệt; người dùng được thông báo trước khi upload PDF.
- Tự động xử lý PDF chứa text; trang PDF ảnh scan chạy OCR vie+eng. Tối đa 15 MB/30 trang; không đọc tên/CMND/tài khoản để tính lương.
- Không gửi file PDF hoặc nội dung qua API trong code.
- Lưu đồ file không tải server: PDF -> PDF.js getTextContent() theo vị trí -> `extractLedger` -> `inferFormulas` -> Smart Insights / `knowledgeFor` / `buildWorkbookBytes`.
- `pdfClient.js`: giữ page number, gộp các text items có cùng tọa độ y; khi không có text thì OCR lại trang dạng ảnh. OCR có thể sai nên UI cho xem văn bản gốc và sửa tay.
- `xlsxExport.js`: viết OOXML SpreadsheetML và gói ZIP method STORE ngay ở máy; tạo Excel 4 sheet, **không yêu cầu SheetJS/CDN Excel**. Công thức Excel chỉ xuất khi trùng giá trị nguồn (cột D), cột F chứa công thức, cột J đối soát. Không có công thức khi thiếu dữ liệu để tránh tưởng tượng.
- `laws.js`: bảng tra cứu nguồn văn bản chính thức được rà soát 07/11/2026. Lương tối thiểu vùng 2026, dự kiến theo hiệu lực 2027; thuế TNCN 5 bậc và giảm trừ gia cảnh 15,5tr + 6,2tr; BHXH/BHYT/BHTN NLĐ theo tỷ lệ tham chiếu; BLLĐ điều 95,98,104. Không khẳng định đúng/sai thuế hoặc vi phạm hợp đồng khi thiếu thông tin.

## Bốn section
1. **Import bảng lương thực tế**: PDF thật, chọn kỳ lương, vùng lương và số người phụ thuộc; không auto-upload.
2. **Bảng lương gốc**: `<object type="application/pdf" data={objectURL}>` để hiển thị PDF đúng cấu trúc, font, dòng và bảng của file gốc, không dựng lại HTML. Không thể đảm bảo trình duyệt nào cũng có PDF viewer; có nút tải lại bản gốc.
3. **Smart Insights**: tất cả dòng text, những dòng số tiền, phân loại C&B, công thức khớp, chênh lệch, bảng sửa tay, lọc, xuất Excel thực có formula. Công thức BH và thuế chỉ khi có cơ sở đóng BH / thu nhập tính thuế trên PDF và kết quả đúng. Công thức tổng/khấu trừ/net chỉ khi số học cân bằng.
4. **C&B Knowledge Base**: đối chiếu các khoản có trong PDF với nguồn luật; nhiều quy định cần thêm hợp đồng, địa điểm, đối tượng cư trú, thu nhập miễn thuế để kết luận; không dùng mức lương tối thiểu 2027 cho năm 2026.

## Nguồn pháp luật xác minh 07/11/2026
- Bộ luật Lao động 45/2019/QH14: https://vanban.chinhphu.vn/?docid=198540&lang=vi&pageid=27160
- Luật BHXH 41/2024/QH15 (hiệu lực 01/07/2025): https://vanban.chinhphu.vn/?classid=1&docid=211199&orggroupid=1&pageid=27160
- Cơ quan BHXH tỷ lệ NLĐ 10,5% (8% + 1,5% + 1%): https://baohiemxahoi.gov.vn/tintuc/Pages/ky-niem-25-nam-thanh-lap-bhxh-viet-nam.aspx?CateID=0&ItemID=24900
- Luật Thuế TNCN 109/2025/QH15 (kỳ lương 2026): https://vanban.chinhphu.vn/?classid=1&docid=216495&pageid=27160&typegroupid=1
- Nghị định 253/2026/NĐ-CP hướng dẫn thuế: https://vanban.chinhphu.vn/?docid=218684&pageid=27160&typegroupid=4
- Mức lương tối thiểu 2026 theo NĐ 293/2025/NĐ-CP: https://vanban.chinhphu.vn/?classid=1&docid=215832&pageid=27160
- Mức lương tối thiểu 2027 theo NĐ 399/2026/NĐ-CP: https://vanban.chinhphu.vn/?docid=220166&pageid=27160&typegroupid=4 (hiệu lực 01/01/2027)

## Giới hạn rõ ràng
- **Hiển thị PDF nguyên bản** không có nghĩa tự nhận dạng 100% nội dung mọi file PDF.
- Không thể tự suy ra **công thức gốc chính xác 100%** nếu PDF chỉ chứa số cuối cùng; ứng dụng chỉ mô phỏng được phép tính số học khớp và phân biệt rõ nguồn.
- PDF scan, bảng nhiều cột có thể OCR thiếu/sai; yêu cầu đối chiếu và sửa tay.
- Không kết luận về tuân thủ lao động chỉ từ bảng lương, và không đưa dữ liệu cá nhân sang Google Drive khi người dùng chưa chủ động kết nối, cấp quyền và chọn phương án bảo vệ dữ liệu.
- Bộ kiểm thử node tự động kiểm tra parser, nhận dạng, ngày hiệu lực, workbook ZIP và shortcut/route; kiểm thử Chrome thực tế với bảng lương thật vẫn cần làm sau khi có tài liệu mẫu được chia sẻ.

## Vận hành
Tại root repo chạy `npm test` và `npm run build`; CI Quality Gate kiểm tra production build. Khi Cloudflare Pages deploy bản `main`, vào `/payroll-insights/` để import bảng lương PDF.

## Mở rộng Google Drive mã hóa · 07/11/2026

**Mục đích:** tuân thủ quy ước các trang thống kê/dữ liệu đều có khả năng backup Google Drive, nhưng tài liệu lương nhạy cảm **không được tự động lưu dưới dạng rõ**.

- Khu vực **Google Drive · Sao lưu có mã hóa** xuất hiện bên dưới Section 1, **tắt mặc định**. Chỉ bật sau khi người dùng điền mật khẩu tối thiểu 12 ký tự và chủ động kết nối OAuth Web Client ID giống Editor (`VITE_GOOGLE_CLIENT_ID`, fallback cấu hình Editor).
- Sau khi bật, thay đổi trên bảng phân tích được sao lưu tự động sau 12 giây và kiểm tra mỗi 3 phút khi tab mở, có nút **Đồng bộ ngay**; chỉ khi OAuth còn hiệu lực và có dòng dữ liệu.
- Mật khẩu chỉ giữ trong bộ nhớ của tab, không lưu localStorage, Google Drive hay server. Dùng **PBKDF2-SHA256 310.000 iterations**, salt 16 byte ngẫu nhiên, AES-256-GCM nonce 12 byte ngẫu nhiên và dữ liệu đã xác thực (auth tag). Mỗi snapshot mã hóa riêng.
- Chỉ upload JSON **đã mã hóa**: số liệu từng dòng, kỳ lương, vùng, số người phụ thuộc và tên tệp dưới lớp mã hóa. **Không upload PDF gốc**; khi restore vẫn phải import lại PDF để xem 1:1.
- Snapshot riêng `appProperties.dn_payroll = encrypted_snapshot_v1`, tách biệt Starbucks/Highlands/Expenses/Markdown. Mỗi lần push tạo file mới append-only, có CAS kiểm tra snapshot HEAD, read-back xác nhận sau POST; không âm thầm ghi đè khi có thay đổi ở thiết bị khác.
- Nếu Drive đã có backup, phải chủ động chọn **Khôi phục (giải mã)** hoặc **Giữ bản hiện tại/tạo snapshot mới**; không tự pull/đè dữ liệu. Trước khi restore, UI yêu cầu xác nhận; mật khẩu sai không làm thay đổi dữ liệu đang xem.
- Quên mật khẩu sẽ không giải mã được. Kết nối Drive phụ thuộc phạm vi OAuth `drive.file`, yêu cầu bật Drive API và Web Client ID. Thời hạn đăng nhập OAuth giới hạn; khi hết hạn cần kết nối lại.
- Lưu ý: dữ liệu mã hóa vẫn đặt ở Google Drive do người dùng cấp quyền. Nếu cần bảo vệ nghiêm ngặt hơn, không bật đồng bộ và chỉ xuất workbook/PDF khi thật sự cần.

### Hotfix phát hiện khi mở rộng
- Trước đây React cleanup `useEffect([url])` cũng tăng generation token, nên việc chọn PDF mới có thể bị coi là import cũ và tự hủy kết quả. Cleanup giờ **chỉ revoke Object URL**; token chỉ tăng khi chủ động thay file/xóa/khôi phục hoặc unmount. Test hồi quy xác nhận không có `generation.current+=1` trong cleanup URL.

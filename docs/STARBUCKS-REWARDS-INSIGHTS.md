# Starbucks Rewards & Insights — Nhật ký triển khai

**Ngày:** 07/11/2026 (Asia/Ho_Chi_Minh)  
**Repository:** [duykhang68/tetdinhmuiblog](https://github.com/duykhang68/tetdinhmuiblog)  
**Nhánh:** `feat/starbucks-rewards-light-insights-20261107`  
**Trang:** `/starbucks-insights/`  
**Local:** `http://localhost:5173/starbucks-insights/`  
**Cloudflare Pages sau deploy:** `https://duynguyen-reddit-editor.pages.dev/starbucks-insights/`

## 1. Mục tiêu và quyết định thiết kế

Triển khai một trang độc lập dành cho việc ghi nhận chi tiêu tại Starbucks Việt Nam, thống kê theo tháng và tính Stars ước tính. Giao diện sử dụng hoàn toàn **light mode** theo ngôn ngữ thị giác Reddit, không kế thừa giao diện nền tối từ bản phác thảo ban đầu.

- Nền trang `#f7f8fa`, surface `#ffffff`, nội dung `#171717`.
- Accent cho thống kê và hành động: Reddit OrangeRed `#ff4500`.
- Accent cho hội viên/Rewards: Starbucks Green `#00754a`.
- Font Reddit Sans, responsive, card có viền sáng và nhiều khoảng trắng.
- Không dùng biểu đồ xanh mặc định, Dark Mode, overlay loading toàn màn hình hoặc giả lập số liệu trong production.

**Lưu ý:** Giao diện lấy cảm hứng từ Reddit, không phải sản phẩm chính thức của Reddit hay Starbucks.

## 2. Các file đã triển khai

| File | Chức năng |
| --- | --- |
| `apps/web/starbucks-insights/index.html` | HTML entry riêng cho /starbucks-insights/ |
| `apps/web/src/starbucks-insights/main.jsx` | Mount React độc lập |
| `apps/web/src/starbucks-insights/StarbucksInsights.jsx` | Form giao dịch, KPI, biểu đồ tương tác, Rewards, bảng lịch sử, sao lưu |
| `apps/web/src/starbucks-insights/model.js` | Validation, tính điểm sao, nhóm theo tháng, chu kỳ hạng |
| `apps/web/src/starbucks-insights/receiptOcr.js` | Parse OCR hóa đơn Starbucks, đối chiếu tiền và cảnh báo sai lệch |
| `apps/web/src/starbucks-insights/receiptOcrBrowser.js` | OCR tiếng Việt/Anh chạy trong browser, tải engine theo nhu cầu |
| `apps/web/test/starbucksReceiptOcr.test.mjs` | Kiểm thử hóa đơn Sora Mall và tình huống OCR thiếu/sai |
| `apps/web/src/starbucks-insights/starbucks.css` | Design tokens và CSS scoped light mode |
| `apps/web/vite.config.js` | Vite multi-page build cho route mới |
| `apps/web/src/App.jsx` | Shortcut Starbucks tại khu vực Truy cập nhanh |
| `apps/web/src/editor-kit.css` | Style shortcut xanh Starbucks trên Editor |
| `apps/web/test/starbucksInsights.test.mjs` | Node unit tests và kiểm thử kết nối route |
| `docs/STARBUCKS-REWARDS-INSIGHTS.md` | Tài liệu và nhật ký triển khai |

## 3. Dòng chảy dữ liệu

1. Người dùng nhập ngày, cửa hàng/món, số tiền VNĐ, số ly, phương thức thanh toán, phí không tính sao và điều kiện tích sao.
2. `normalizeTransaction()` kiểm tra ngày, số tiền, phí, số ly, phương thức, rồi cập nhật state.
3. `localStorage` ghi dữ liệu theo key `dn-starbucks-insights-v1`; lần mở tiếp theo đọc lại dữ liệu. Không có backend hay đồng bộ đa thiết bị trong phiên bản này.
4. `monthlySeries()` nhóm theo tháng `YYYY-MM` và bổ sung các tháng có giá trị 0 trong thời gian chọn.
5. `analytics()` tính tổng chi, số ly, số lượt, trung bình, tháng cao/thấp, MoM.
6. SVG Bar/Line Chart dùng chung state, cho phép chuyển chế độ, xem chi tiết tháng; có bộ lọc kỳ 6/12/24 tháng, toàn bộ, năm và phương thức thanh toán.
7. `starsFor()` tính Sao Xét Hạng và Sao Đổi Thưởng theo loại giao dịch đủ điều kiện.
8. `rewardsProgress()` tính tiến độ chu kỳ 12 tháng và số dư Rewards ước tính có điều chỉnh thủ công.
9. Bảng lịch sử có tìm kiếm, lọc cùng chart, sửa, xóa, phân trang và xuất/nhập JSON, xuất CSV.
10. `orderId` là mã đơn hàng/Check No. tùy chọn (chuỗi, tối đa 120 ký tự), được giữ nguyên các số 0 đầu, lưu trong `localStorage`, backup JSON và CSV. Giao dịch cũ thiếu trường này tự được chuẩn hóa thành chuỗi rỗng; cột lịch sử hiển thị `—` khi chưa có mã và hỗ trợ tìm kiếm theo mã.
11. Chi tiết hóa đơn: `baseAmount` (giá món gốc, null khi không biết), `extraAmount` và `extraReason` (phụ thu/tùy chỉnh), `discountAmount` và `discountReason` (giảm giá). Khi có tiền gốc, form tính `amount = baseAmount + extraAmount - discountAmount`, đồng thời hiển thị tạm tính trước giảm và tổng thực trả. Khi không có tiền gốc, `amount` vẫn nhập thủ công tương thích dữ liệu cũ. KPI và Stars chỉ tính theo `amount` thực trả; CSV và JSON giữ toàn bộ trường mới.

## 4. Chính sách Starbucks Rewards tại Việt Nam

Nguồn điều khoản chính thức:  
<https://starbucks.vn/ve-chung-toi/cong-ty/chinh-sach-truc-tuyen/starbucks-rewards-terms-and-conditions/>

**Hiệu lực chính sách được áp dụng trong mô hình:** 18/08/2026.

| Hình thức | VNĐ / 1 Sao Xét Hạng và 1 Sao Đổi Thưởng |
| --- | ---: |
| 100% Starbucks Card | 40.000 |
| Tiền mặt, ví, POS, thanh toán kết hợp, Voucher Bundle tại quán | 60.000 |
| Ứng dụng đối tác và thanh toán không tiền mặt, đã liên kết tài khoản đủ điều kiện | 80.000 |
| Ứng dụng đối tác, thanh toán tiền mặt | 0 sao |

Quy tắc được thực thi:

- Chỉ dùng số tiền đã trả sau giảm giá; loại trừ phí giao hàng/đối tác.
- Cần xác định tài khoản bằng thẻ/QR trước khi thanh toán trực tiếp; đơn đối tác phải liên kết tài khoản đủ điều kiện.
- Không tính điểm cho giao dịch bị đánh dấu không đủ điều kiện, ví dụ sân bay quốc tế, hàng bị loại trừ hoặc nạp/khởi tạo thẻ.
- Sao có thể là số thập phân.
- Không áp dụng quy tắc từ 18/08/2026 cho giao dịch trước ngày này: người dùng đối soát thủ công.
- **Membership Stars** và **Rewards Redemption Stars** tách riêng; không trừ chéo.
- Gold được xét khi đạt **100 Membership Stars** trong chu kỳ 12 tháng; biểu đồ hiển thị tiến độ, không tự tuyên bố tài khoản chính thức đã chuyển hạng.
- Chu kỳ có thể được người dùng đặt theo ngày hội viên thực tế; sao điều chỉnh và sao đã đổi được cấu hình riêng.
- Mốc đổi thưởng tham khảo: Green 20 Sao Đổi Thưởng, Gold 10 Sao Đổi Thưởng; mức thưởng thực tế còn tùy hạng và điều kiện giao dịch.
- Chính sách có thể thay đổi; mọi Stars trên dashboard là **ước tính** và có thể khác số dư ứng dụng do khuyến mại, hạng, ngày hết hạn, hoàn tiền, điều chỉnh hoặc chuyển chu kỳ.

## 5. Quyết định kỹ thuật / rủi ro

- **Không thêm dependency** cho chart: sử dụng React + SVG native để tránh làm nặng bundle và tránh thêm lockfile chỉ vì biểu đồ.
- Trang dùng entry Vite riêng ở thư mục `starbucks-insights/`; Cloudflare Pages có thể phục vụ route tĩnh theo cấu trúc folder/index.html.
- Tất cả số liệu giao dịch là do người dùng nhập; dashboard không gọi API Starbucks hoặc tự phát sinh giao dịch mẫu.
- Dữ liệu không tự đồng bộ sang thiết bị khác. Cần xuất JSON để sao lưu và nhập lại khi đổi trình duyệt.
- Phiên bản này chưa có auto-import hóa đơn, đồng bộ tài khoản Starbucks, server-side storage, tính promotional Stars hay engine xử lý voucher hết hạn.
- Date grouping dùng ngày `YYYY-MM-DD` được nhập theo lịch Việt Nam; ngày hôm nay lấy theo timezone `Asia/Ho_Chi_Minh`.
- Reset/đổi hạng/hết hạn chính thức vẫn cần người dùng đối soát, đặc biệt khi nâng hạng giữa chu kỳ.

## 6. Kiểm thử và phát hành

Các kiểm thử mới trong `apps/web/test/starbucksInsights.test.mjs`:

- Tỷ lệ 40k/60k/80k và số sao phân số.
- Giao dịch bị loại trừ, trước chính sách, chưa quét QR và đối tác trả tiền mặt.
- Validation ngày, số tiền, số ly và phí.
- Tổng hợp nhiều tháng, nhiều năm, tháng chi tiêu 0 và số lượt khác số ly.
- Chu kỳ xét hạng 12 tháng, phân biệt mốc Green/Gold.
- Kiểm tra đường dẫn độc lập, Vite entry, shortcut Editor và chỉ sử dụng light mode.

**Lệnh dự kiến được CI sử dụng:**

```bash
npm run check
npm test
npm run build
```

Tài liệu này ghi lại quy trình và phạm vi thay đổi mã nguồn; **không khẳng định CI hoặc production đã thành công trước khi GitHub Actions xác nhận**.

## Import giao dịch từ ảnh hóa đơn (OCR trên trình duyệt)

- Trong **Ghi nhận giao dịch**, chọn **Import giao dịch từ ảnh hóa đơn → Chọn ảnh hóa đơn**.
- Hỗ trợ JPG, PNG, WebP tối đa 10 MB. Ảnh được nhận dạng ngay trong browser; không gửi ảnh lên máy chủ. Lần đầu trình duyệt tải Tesseract.js phiên bản cố định từ CDN và mô hình OCR `vie` + `eng` (cần Internet); engine chạy bằng WebAssembly.
- Parser nhận mã đơn, ngày, cửa hàng, món, số ly, giá món gốc, phụ thu, giảm giá, thực trả và phương thức thanh toán khi đọc được. Không suy đoán lý do giảm giá từ món Personal Cup.
- Xem trước ảnh, văn bản OCR, độ tin cậy tham khảo và cảnh báo. Nếu các khoản tiền không khớp, giữ số thực trả đọc từ tổng đơn và yêu cầu người dùng đối chiếu lại; không tự gán giá gốc sai.
- **Không tự lưu**: OCR chỉ điền form, người dùng phải kiểm tra, chỉnh sửa và bấm **Thêm giao dịch**. Vẫn có thể nhập thủ công khi OCR/CDN bị lỗi.
- Ảnh chỉ được tạo Object URL để xem trước, không lưu vào localStorage hoặc JSON. Dữ liệu giao dịch vẫn lưu trên trình duyệt hiện hành, chưa đồng bộ Google Sheets.
- Chất lượng OCR phụ thuộc độ nét, ngôn ngữ và layout ảnh; kiểm tra lại dữ liệu, đặc biệt số tiền và mã đơn hàng.

## 7. Hướng dẫn sử dụng nhanh

1. Mở Editor, vào **Truy cập nhanh → Starbucks Rewards & Insights**.
2. Nhập giao dịch trong **Ghi nhận giao dịch**.
3. Xem KPI và chuyển **Bar / Line** ở **Monthly Spending Trends**.
4. Thiết lập ngày bắt đầu chu kỳ, hạng và sao điều chỉnh nếu cần.
5. Xem lịch sử, sửa/xóa hoặc xuất **Backup JSON** định kỳ.

## 8. Nhật ký triển khai

- 07/11/2026 — xác nhận repository và kiến trúc React 19 + Vite multi-page.
- 07/11/2026 — xác minh lại điều khoản Starbucks Rewards VN áp dụng từ 18/08/2026.
- 07/11/2026 — tạo branch riêng, model tính Stars và analytics, HTML entry, React page và CSS light mode.
- 07/11/2026 — thêm Editor Quick Access, bộ lọc biểu đồ, lưu giao dịch, bảng lịch sử, sao lưu và tests.
- 07/11/2026 — bổ sung tài liệu nhật ký này để theo dõi quá trình phát triển và giới hạn của phiên bản đầu tiên.
- 07/11/2026 — thêm trường tùy chọn Mã đơn hàng (Order ID / Check No.) vào form, model, bảng lịch sử, tìm kiếm và xuất CSV; thêm kiểm thử tương thích dữ liệu cũ. Không thay đổi cơ chế lưu `localStorage` và không giả định đồng bộ Google Sheets.
- 07/11/2026 — đối chiếu hóa đơn Sora Mall (80.000đ giá món + 5.000đ tùy chỉnh − 10.000đ giảm giá = 75.000đ thực trả); bổ sung breakdown và lý do phụ thu/giảm, form tự tính, bảng lịch sử, JSON/CSV và validation; kiểm thử logic/legacy.

- 07/11/2026 — thêm OCR hóa đơn chạy tại trình duyệt với import ảnh, autofill, đối soát giá, cảnh báo và test; ảnh không được gửi lên server.


### OCR name cleanup hotfix — 07/11/2026

- Khắc phục nhận dạng tên cửa hàng "Sora Mall %" thành "Sora Mall" và tên món "-_ Pure Matcha Latte" thành "Pure Matcha Latte".
- Chỉ gỡ ký tự/biểu tượng bị nhận dạng thừa ở **đầu hoặc cuối** tên, không xóa dấu gạch nối bên trong tên đồ uống, dấu ngoặc size hay phần trăm hợp lệ.
- Áp dụng cho cả tên cửa hàng, món và phần mô tả tùy chỉnh từ OCR; không tác động dữ liệu giao dịch đã lưu và không thay đổi logic số tiền / Stars.
- Thêm kiểm thử hồi quy bằng chính chuỗi OCR người dùng báo lỗi và các trường hợp tên hợp lệ.

### OCR original amount + surcharge hotfix — 07/11/2026

- Trường hợp Sora Mall: OCR có thể nhận được giá món gốc 80.000đ, tạm tính 85.000đ, giảm 10.000đ, thực trả 75.000đ nhưng bỏ sót phụ thu Half & Half 5.000đ. Form cũ xóa `baseAmount` nếu chưa khớp; đã bỏ hành vi xóa dữ liệu OCR.
- Parser bổ sung đối soát để **điền phụ thu thiếu 5.000đ** khi các tổng hóa đơn nhất quán: `subtotal - discount = total`, và `missing extra = subtotal - baseAmount - extraAmount`. Nếu OCR không đọc được tạm tính nhưng đọc rõ tổng + giảm, cho phép suy ra phần chênh lệch từ hai khoản đó.
- Phần tiền suy ra có **cảnh báo rõ ràng**; nếu dữ liệu tổng xung đột hoặc có phí giao hàng, không tự suy ra phụ thu. Không tự động sửa tổng thực trả để che lỗi OCR.
- Giá gốc và phụ thu đã đọc được luôn giữ trên form để đối chiếu thủ công; khi các khoản chưa cân bằng, validation vẫn ngăn lưu giao dịch cho đến khi người dùng sửa.
- Có test hồi quy cho hóa đơn Sora Mall, OCR bỏ sót dòng tùy chỉnh, OCR thiếu tạm tính, tổng sai và kiểm tra không tính phụ thu hai lần. Không thay đổi giao diện, cách lưu dữ liệu hay chính sách Stars.

### OCR description autofill & receipt equation UI — 07/11/2026

- OCR điền **Chi tiết phụ thu / tùy chỉnh** từ những dòng mô tả thực có trên ảnh (vd. `Sữa: Sữa Half & Half`, `Độ ngọt: Không ngọt`) ngay cả khi OCR không đọc ra số 5.000đ. Giữ đối soát phụ thu từ PR #71, không gán chênh lệch cho từng tùy chỉnh khi hóa đơn không xác định được mức phí riêng.
- OCR điền **Lý do giảm giá** khi hóa đơn có diễn giải thật như `Giảm giá: Voucher thành viên` hoặc `Giảm giá → Voucher sinh nhật → -₫10.000`. Nếu ảnh chỉ ghi `Giảm giá -₫10.000` thì để trống lý do, báo rõ là chưa thấy trong ảnh; không tự suy diễn từ dòng `Personal Cup`.
- Tách `Tạm tính trước giảm`, `Giảm giá`, `Thực trả` thành 3 thẻ trực quan với phép tính dấu trừ/bằng, dùng light mode cam Reddit, chữ số lớn, tăng tương phản và bố cục responsive khi trên mobile.
- Giữ nguyên khả năng người dùng chỉnh sửa trường phụ thu/lý do giảm và việc tự tính tổng. Không thay đổi cách lưu dữ liệu, nghiệp vụ Stars hoặc layout khác ngoài phần tổng hợp hóa đơn.
- Có test cho diễn giải tùy chỉnh không có giá, lý do giảm đơn dòng/đa dòng, trường thiếu lý do và giao diện đối soát.

### Reddit Light colors — receipt reconciliation hotfix (07/11/2026)

- Giữ nguyên bố cục và mọi phép tính trong `sb-finance-summary`. Chỉ chỉnh CSS cho khu vực **Đối soát hóa đơn**.
- Thay đường viền ngoài cam `#ffd6c5` và nền gradient cam bằng surface trắng `#ffffff`, viền trung tính `#e3e6e8` và shadow mờ nhẹ; giữ OrangeRed cho nhãn tiêu đề.
- Ba thẻ: **Tạm tính** nền trắng/viền trung tính; **Giảm giá** đỏ nhạt, số tiền đỏ; **Thực trả** xanh lá nhẹ `#eaf6ef`/viền `#c8e7d4`, số tiền xanh đậm `#006b43`.
- Dấu trừ/bằng chuyển về màu xám trung tính để không chiếm sự chú ý từ số tiền thực trả. Không đổi layout, responsive, logic OCR, Stars, form, dữ liệu hoặc chức năng.
- Thiết kế lấy cảm hứng từ tinh thần Reddit Light: neutral palette chủ đạo, OrangeRed có chủ đích; màu xanh lá là bổ sung mang ngữ nghĩa số tiền cuối, không phải một token màu chính thức của Reddit.
- Bổ sung regression test xác nhận palette mới; CI Quality Gate là điều kiện chấp nhận.

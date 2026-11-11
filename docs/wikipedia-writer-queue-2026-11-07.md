# Wikipedia Writer — Hàng đợi thực thi tuần tự (07/11/2026)

## Mục tiêu
Bổ sung nút **Xếp hàng thực thi** bên cạnh **Đọc & tạo bài viết** trên `/wikipedia-writer/`. Người dùng thêm nhiều URL Wikipedia; một worker trên trang xử lý lần lượt theo FIFO. Bài đã tạo được giữ riêng trong danh sách, có nút **Mở kết quả** để kiểm chứng và chỉnh sửa trước khi chủ động ghi từ vựng vào Google Sheets.

## Những thay đổi
- `apps/web/src/wikipedia-writer/queue.js`: mô hình job, chống trùng URL đang chờ/đang chạy, lưu/khôi phục hàng đợi (không chứa API keys).
- `Writer.jsx`: nút đôi; danh sách hàng đợi; vòng đời `queued → running → done/failed`; mở kết quả, xóa job và thử lại job thất bại; kế thừa cơ chế Gemini → Groq dự phòng.
- `writer.css`: điều chỉnh nút, queue card theo giao diện sáng, responsive.
- `test/wikipediaQueue.test.mjs`: kiểm thử FIFO, duplicate, phục hồi trạng thái và dữ liệu hỏng.

## Các bước thực hiện
1. Kiểm tra logic hiện hữu: `wikiExtract → PROMPT → generateGemini/generateGroq → parseAIJson`.
2. Tách mô hình hàng đợi thuần JS, định dạng dữ liệu chỉ chứa URL, provider, trạng thái và kết quả.
3. Thêm worker tuần tự để không khởi động job thứ hai đồng thời trong cùng một tab.
4. Giữ kết quả từng job riêng, **không tự gửi** Google Sheets vì người dùng phải duyệt trước.
5. Bổ sung giao diện, kiểm thử và ghi lại giới hạn vận hành.

## Cách dùng
1. Nhập URL và chọn provider; cấu hình ít nhất một API key.
2. Nhấn **Xếp hàng thực thi**, tiếp tục nhập URL kế tiếp.
3. Giữ trang mở: sau khi job trước thành công hoặc thất bại, job tiếp theo tự chạy.
4. Với bài đã hoàn thành, nhấn **Mở kết quả**, đọc/biên tập, sau đó chọn **Ghi từ mới vào Google Sheet** nếu phù hợp.
5. Job thất bại có nút **Thử lại**. Có thể xóa job không còn chạy.

## Giới hạn của phiên bản này
- Đây là **hàng đợi cục bộ trên một tab đang mở**, không phải Cloudflare server queue. Không tiếp tục thực thi khi tất cả tab đóng. Reload giữ danh sách và kết quả nhờ localStorage, job dở được đưa lại vào hàng chờ và chạy lại sau khi có API key.
- Không bảo đảm độc quyền giữa nhiều tab/thiết bị; chỉ sử dụng một tab cho hàng đợi. Không xử lý song song trong cùng một tab khi dùng nút chạy ngay.
- Dữ liệu localStorage có giới hạn dung lượng và không được mã hóa; không nhập thông tin bí mật vào nội dung hàng đợi. API keys không được đưa vào queue.
- Cơ chế lưu trên Google Drive hiện tại chỉ dành cho **một bản thảo đang mở**, chưa đồng bộ toàn bộ job queue.
- Nếu cần queue tiếp tục khi tắt máy/trình duyệt: cần Cloudflare Worker + D1/Queues, xác thực người dùng, secrets Gemini/Groq trên server, lease + retry idempotent; **chưa triển khai** và cần cấu hình Cloudflare.
- Kết quả là bản thảo AI, phải được kiểm chứng trước khi đăng. Không tự động xuất bản hoặc tự ghi Sheets.

## Kiểm thử
`node --test apps/web/test/wikipediaQueue.test.mjs` (chạy ở repository root).
`npm run build --workspace=@duynguyen/editor-web` tùy thiết lập workspace của repo.

## Quay lui
Revert các commit của nhánh `feat/wikipedia-writer-sequential-queue-20261107`; thay đổi không tạo schema backend và không làm thay đổi nội dung Google Sheet tự động.

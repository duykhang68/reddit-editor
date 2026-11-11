# Tự hoàn thiện từ vựng Việt – Hàn – Anh bằng Gemini → Groq

**Google Sheet:** https://docs.google.com/spreadsheets/d/19nL6wtouHV-0OumsQR2jF-5xWA1cpbpivRUIsm7hDgk/edit?gid=0

**Mã nguồn:** [apps-script/VocabularyAiAutofill.gs](../apps-script/VocabularyAiAutofill.gs)

> Lưu ý: Đây là mã nguồn Apps Script **để triển khai vào Google Sheet**. Commit mã lên GitHub không tự cài trigger hoặc sửa dự án Apps Script gắn với Sheet. Kết nối hiện tại chưa cấp quyền chỉnh sửa trực tiếp Apps Script project, nên chủ sở hữu phải cài một lần theo hướng dẫn bên dưới.

## Nguyên tắc

| Cột | Dữ liệu | Ai nhập? |
| --- | --- | --- |
| A | Việt | Người dùng |
| B | Hàn | Người dùng |
| C | Anh | Người dùng |
| D | Context or Expression | Gemini, dự phòng Groq |
| E | Ngữ pháp ví dụ, gồm VI:/KR:/EN: | Gemini, dự phòng Groq |
| F | Category | Gemini, dự phòng Groq |

- **Chỉ xử lý khi đủ A, B, C**; dán lần lượt từng cột đều được. Nếu bạn dán một lúc nhiều dòng, script xử lý dần theo lô.
- Không bao giờ đổi nội dung A–C; chỉ ghi vào **ô D–F đang trống**, không ghi đè ô đã nhập hoặc ô có công thức.
- **Gemini trước**, lần lượt `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.5-flash`. Nếu tất cả thất bại, fallback Groq `qwen/qwen3.8-27b`. Bạn có thể đổi danh sách trong Script Properties (đừng đưa khóa API vào code).
- D–F được điền trực tiếp vào Sheet nguồn. Trang **Vocabulary Insights** đọc lại các dữ liệu này sau khi đồng bộ, không tự gọi AI trên trình duyệt.
- Script tự động xem xét hàng bị ẩn (không bỏ qua), nhưng không tự xử lý nếu A–C còn thiếu.
- 1-minute trigger dùng để xử lý lô nhỏ **tối đa 3 dòng/đợt**, tránh timeout và API quota. Không cần chạy các yêu cầu AI trong sự kiện onEdit. Thời gian hoàn tất cả kho phụ thuộc số ô còn trống và hạn mức API.
- Sau khi quét xong, worker tạm bỏ qua các chu kỳ nhàn rỗi để tiết kiệm quota, có quét hồi phục mỗi 6 giờ. Nếu API lỗi, giữ lại dòng cần xử lý để thử lại sau tối thiểu 10 phút.

## Cài đặt Apps Script (một lần)

1. Mở Google Sheet ở trên → **Extensions → Apps Script**.
2. Thêm tệp script mới tên `VocabularyAiAutofill.gs`, dán **toàn bộ** nội dung file ở GitHub vào. Nếu dự án đã có hàm `onOpen` thì **gộp menu mới vào hàm onOpen hiện có**, không tạo hai hàm `onOpen` vì sẽ ghi đè nhau. Không xóa code cũ khi chưa kiểm tra.
3. Trong **Project Settings → Script Properties**, đặt:
   - `GEMINI_API_KEY`: khóa API Gemini **thật** từ Google AI Studio.
   - `GROQ_API_KEY`: khóa API Groq **thật** (bắt buộc để có fallback).
   - Tùy chọn `GEMINI_MODELS`: ví dụ `gemini-3.8-flash,gemini-3.7-flash`.
   - Tùy chọn `GROQ_MODEL`: `qwen/qwen3.8-27b`.
4. Lưu dự án. Chọn hàm `installVocabularyAiTriggers` → **Run** → cấp quyền Spreadsheet, Triggers và External requests. Hàm xóa các trigger cũ **chỉ của hai handler cùng tên**, cài lại một `onEdit` installable và một worker time-driven 1 phút, rồi đưa toàn bộ dữ liệu vào hàng chờ quét.
5. Tải lại Sheet. Menu mới **🧠 Vocabulary AI** sẽ có các mục:
   - **Quét lại các cột D–F còn trống:** requeue toàn bộ, không ghi đè dữ liệu có sẵn.
   - **Xử lý ngay một đợt:** chạy 3 dòng (tối đa) để thử nghiệm.
   - **Xem trạng thái:** số dòng đã xử lý, provider gần nhất, lỗi gần nhất.
6. Nhập thử một dòng A–C tại dòng mới, để D–F trống; chọn **Xử lý ngay một đợt** hoặc chờ time trigger. Kiểm tra D–F và Execution logs. Sau khi điền thành công, mở Vocabulary Insights, nhấn **Đồng bộ ngay**.

## Lưu ý về khóa

**`GOOGLE_SERVICE_ACCOUNT_JSON` mà bạn vừa cài trong Cloudflare không phải Gemini API key.** Nó chỉ cấp quyền đọc Google Sheets cho trang web. Apps Script cần **`GEMINI_API_KEY`** và **`GROQ_API_KEY`** trong **Script Properties của chính dự án Apps Script này**. Nếu đã có khóa ở dự án Apps Script khác, có thể sử dụng lại khóa hợp lệ nhưng cần cấu hình ở project này.

Không paste JSON private key, API key hoặc token vào GitHub, comment, URL, ảnh chụp màn hình hoặc đoạn chat.

## Kiểm tra chất lượng

Test Node tại `apps/web/test/vocabularyAppsScript.test.mjs` kiểm tra parse JSON, thứ tự gọi Gemini → Groq, fallback và bảo vệ cột đã có dữ liệu. Test không thực hiện AI request thật; xác nhận chạy thực tế vẫn cần trigger được cài và API keys hợp lệ trong Apps Script.

# GLOBAL RULE — Google Drive sync required for ALL statistics, expenses and data pages

> **Owner directive / Quy định bắt buộc** · effective 2026-11-07 · scope: `duykhang68/tetdinhmuiblog`.
>
> **MỌI trang thống kê, chi phí, tài chính, dashboard phân tích và trang quản lý/nhập/xuất dữ liệu đều PHẢI có đồng bộ lên Google Drive.** Đây là yêu cầu mặc định khi tạo trang mới và khi thay đổi các trang hiện có. Không được coi dữ liệu chỉ ở localStorage, GitHub, Cloudflare hoặc RAM là phương án sao lưu hoàn chỉnh.

## 1. Phạm vi

Bao gồm tất cả route độc lập, mini-app, widget dashboard hoặc section quản lý dữ liệu trong Editor, kể cả:
- Statistics / Analytics / Insights / Research / Collector / Quality Gate, báo cáo, lịch sử, biểu đồ có dữ liệu nguồn;
- Expenses / Starbucks / transactions / finance / receipts / personal spending;
- Trang lưu records, imports, logs, cấu hình, tập dữ liệu, snapshot hoặc dữ liệu do người dùng nhập;
- Những trang mới có cùng mục đích, dù tên không chứa từ "insights", "data" hay "expenses".

Áp dụng cho **cả các trang chỉ đọc**: phải có cách lưu/khôi phục bộ dữ liệu hiển thị, bản chụp hoặc các thiết lập người dùng trên Google Drive; không tự ý bỏ qua vì dữ liệu bắt nguồn từ API công khai. Trường hợp cần ngoại lệ thực sự: chủ repo phải phê duyệt rõ và ghi lý do tại PR; chưa được duyệt thì chưa đạt yêu cầu.

## 2. Contract tối thiểu về tính năng và UX

| Yêu cầu | Tiêu chí chấp nhận |
| --- | --- |
| Đăng nhập | Nút `Kết nối Google Drive`; dùng Web OAuth Client ID chung của Editor, ưu tiên `VITE_GOOGLE_CLIENT_ID`, hoặc cơ chế tìm Client ID đang được sử dụng; scope `drive.file` |
| Đồng bộ tự động | 3 phút/lượt (**180.000 ms**) trong lúc trang đang mở, kết nối mạng và OAuth còn hiệu lực; khuyến khích đồng bộ sớm sau thay đổi |
| Đồng bộ thủ công | Nút **Đồng bộ ngay**, hoạt động thật và thông báo thành công/thất bại dựa trên kết quả API |
| Trạng thái | Hiển thị đã kết nối/chờ/đang đồng bộ/đã đồng bộ/xung đột/lỗi; thời điểm đồng bộ thành công; link mở snapshot Drive khi có |
| Khôi phục | Cùng tài khoản Google trên thiết bị khác có thể tải lại toàn bộ dữ liệu tương ứng |
| Bảo toàn dữ liệu | Lưu toàn bộ bản ghi, ID, trường tiền gốc/phụ thu/giảm giá/lý do, bộ lọc/thiết lập cần bảo toàn; không chỉ lưu dòng đang hiển thị |
| Xung đột | Phát hiện thay đổi đồng thời, khác tài khoản hoặc khác revision; **không tự ghi đè**; phải có lựa chọn rõ ràng và xuất JSON dự phòng trước khi thay thế |
| Lưu trữ | Snapshot riêng theo module, có schema/version, identifier `appProperties` và metadata đồng bộ riêng; không trộn dữ liệu chéo |
| Bảo mật | Không commit secret; không ghi access/refresh token vào localStorage/GitHub; không lưu dữ liệu nhạy cảm công khai; cấp quyền tối thiểu |
| Kiểm thử | Unit/integration test mock Google Drive cho upload, read-back, pull/push, conflict, OAuth hết hạn, isolation; kiểm tra build production |

**Lưu ý giới hạn thực tế:** Trang Cloudflare Pages chạy phía client không thể tự đồng bộ khi tab bị đóng hoặc phiên OAuth đã hết hạn. Không trình bày trạng thái local là đã sao lưu thành công khi API chưa xác nhận. Kết nối lần đầu cần có hành động của người dùng để cấp quyền.

## 3. Reuse kiến trúc, không tự tạo một cơ chế mới

- Google Drive service chung: `apps/web/src/services/googleDriveService.js`.
- Editor's Drive OAuth Client ID: `apps/web/src/services/driveClientId.js` và `apps/web/src/expenses/driveClientResolver.js`.
- Mẫu implementation: `apps/web/src/expenses/useExpenseDriveSync.js` và `apps/web/src/starbucks-insights/useStarbucksDriveSync.js`.
- Mẫu snapshot riêng: `appProperties.dn_expenses=snapshot_v1` và `appProperties.dn_starbucks=snapshot_v1`.
- Quy tắc Drive: `read → normalize/validate → compare version/ancestry → push/pull/conflict → verify read-back`. Tránh ghi đè trực tiếp một file hoặc bỏ qua lỗi 401/403/409.

## 4. Checklist bắt buộc trong mỗi Pull Request

- [ ] Trang mới/sửa đổi đã được xác định có thuộc nhóm thống kê/chi phí/dữ liệu hay không.
- [ ] Nếu có: đã triển khai **Kết nối Google Drive, Đồng bộ ngay, tự đồng bộ 3 phút**.
- [ ] Có status, last synced, open-backup link, và thông báo lỗi dễ hiểu.
- [ ] Có khôi phục thiết bị mới, chống overwrite khi xung đột, JSON backup.
- [ ] Có schema/version/Drive tag/metadata key riêng và dữ liệu đầy đủ.
- [ ] Đã test mock API (đọc, ghi, bất đồng bộ, hết hạn token, tách dataset), chạy CI và build.
- [ ] Nếu chưa đạt, PR phải ghi rõ **BLOCKED / NON-COMPLIANT**; không được mô tả là hoàn chỉnh hay tích hợp xong.
- [ ] Ngoại lệ phải có **phê duyệt của chủ repo** trong PR; không suy diễn tự động.

## 5. Tình trạng triển khai hiện có & kế hoạch đưa về chuẩn

Rule có hiệu lực từ khi merge; việc ghi rule **không đồng nghĩa các trang cũ đã được bổ sung tự động**.

| Trang / Nhóm | Tình trạng yêu cầu |
| --- | --- |
| `/expenses/` | Có implementation Google Drive sync, cần xác minh cấu hình cloud khi dùng thực tế |
| `/starbucks-insights/` | Có implementation Google Drive sync (PR #74), cần xác minh cấu hình cloud khi dùng thực tế |
| `/research-insights` | Phải được audit/retrofit theo rule |
| `/quality-gate` | Phải được audit/retrofit theo rule |
| `/collector/` | Phải được audit/retrofit theo rule |
| Các trang thống kê/chi phí/dữ liệu khác | Phải được đưa vào inventory và triển khai/kiểm thử; **không tự coi là compliant** |

Đối với các trang cũ không có Drive sync: thực hiện PR riêng cho từng tính năng, giữ nguyên nguồn số liệu gốc và luồng vận hành; bổ sung đồng bộ Drive như lớp sao lưu/khôi phục, không đổi sang nguồn dữ liệu giả hay phá UI cũ.

## 6. Rule được tham chiếu từ đâu

- `AGENTS.md`: áp dụng với coding agents trong toàn repository.
- `.github/copilot-instructions.md`: hướng dẫn coding assistants trên GitHub.
- `.github/PULL_REQUEST_TEMPLATE.md`: checklist áp dụng khi mở PR mới.
- `README.md`: thông báo công khai ở cấp repo.

**Rule này là yêu cầu review và phát triển.** Nó không tự động thay thế việc cấu hình GitHub branch protection/rulesets hoặc chứng minh tất cả trang cũ đã có Drive. Muốn khóa merge bằng status check, cần gate có khả năng xác định chính xác phạm vi trang và kiểm thử thật theo từng route; không được giả vờ một bước grep tĩnh là phép xác minh đầy đủ.

## Nội dung PR

<!-- 1 tính năng = 1 PR. Mô tả mục tiêu và các file thay đổi. -->

## Bắt buộc: Google Drive sync cho trang thống kê / chi phí / dữ liệu

> **Repository rule:** [AGENTS.md](https://github.com/duykhang68/tetdinhmuiblog/blob/main/AGENTS.md) · [GLOBAL Google Drive sync policy](https://github.com/duykhang68/tetdinhmuiblog/blob/main/docs/GLOBAL-GOOGLE-DRIVE-SYNC-POLICY.md)
>
> Áp dụng cho mọi trang thống kê, tài chính/chi phí, dashboard analytics, dữ liệu, records (cả read-only). Không được ship trang thuộc nhóm này khi thiếu đồng bộ Google Drive.

- [ ] Tôi đã xác định PR này **có** hoặc **không** ảnh hưởng đến trang thống kê / chi phí / dữ liệu; ghi rõ ở mục dưới.
- [ ] Nếu **có**: có kết nối OAuth Drive dùng chung Editor, **Đồng bộ ngay**, và tự đồng bộ mỗi **3 phút** khi tab mở/token hợp lệ.
- [ ] Nếu **có**: có trạng thái sync, thời gian sync gần nhất và link file sao lưu.
- [ ] Nếu **có**: có restore đa thiết bị, snapshot riêng, không trộn datasets và chống ghi đè khi xung đột (JSON dự phòng).
- [ ] Nếu **có**: dữ liệu đầy đủ được sao lưu và có tests mock API + build xanh.
- [ ] Nếu **không** thuộc phạm vi: tôi ghi lý do; nếu cần **ngoại lệ** với trang có dữ liệu, đã xin **chủ repo phê duyệt công khai trong PR**.

**Trang / route bị ảnh hưởng:**
<!-- ví dụ: /expenses/, /starbucks-insights/; hoặc ghi 'Không có' -->

**Tình trạng Google Drive sync:**
<!-- COMPLIANT / BLOCKED / NOT APPLICABLE (kèm bằng chứng hoặc lý do) -->

## Bắt buộc: Shortcut “Truy cập nhanh” trong Editor cho tiện ích/trang mới

- [ ] Tôi đã xác định PR này có tạo tiện ích, dashboard, sub-page hoặc route truy cập riêng mới hay không.
- [ ] Nếu **có**: đã thêm tên hiển thị + canonical URL của trang mới vào mục **Truy cập nhanh** có sẵn trong Editor, ngay trong PR này.
- [ ] Đã kiểm tra link mở đúng trang trên desktop/mobile, không trùng URL và không làm mất hoặc thay đổi shortcut cũ.
- [ ] Đã thêm hoặc cập nhật regression test kiểm tra shortcut; đã xác minh route/deployment.
- [ ] Nếu không áp dụng: nêu lý do (không có URL/route mới). Thiếu shortcut đối với trang mới = **BLOCKED / NON-COMPLIANT**.

**Trang/URL shortcut mới hoặc lý do không áp dụng:**
<!-- Ghi rõ tên và URL hoặc N/A kèm lý do -->

## Kiểm tra

- [ ] `npm run check` (test + syntax)
- [ ] `npm run build`
- [ ] Không có credentials/token/secret trong commit; không đổi UI hoặc logic ngoài phạm vi feature

<!-- Nếu thiếu tính năng Drive trên trang dữ liệu: đánh dấu BLOCKED / NON-COMPLIANT và không mô tả PR là hoàn tất. -->

# Mẫu dàn ý Series — Review phim và thiết bị công nghệ

Editor: https://duynguyen-reddit-editor.pages.dev/  
Repository: `duykhang68/tetdinhmuiblog`

## Thay đổi
Mở rộng danh sách từ **4 thành 6 mẫu**, không xoá hoặc sửa 4 mẫu cũ:

- **🎬 Review phim chiếu rạp (Cinema Review):** thông tin phim/suất chiếu, nhận xét không spoiler, kịch bản, diễn xuất, hình/âm thanh, trải nghiệm rạp, ưu/nhược điểm, có đáng mua vé không, phần spoiler tùy chọn với cảnh báo rõ ràng và kết luận.
- **📱 Trên tay đồ công nghệ (Hands-on Review):** thông tin máy/giá/nguồn thiết bị, mở hộp, chất lượng hoàn thiện, cảm giác cầm nắm, cấu hình, trải nghiệm thực tế có điều kiện thử, điểm cộng/trừ, sản phẩm cùng phân khúc, ai nên mua và các bài kiểm tra dài hạn cần thực hiện.

Các mục trong template chỉ là câu hỏi/gợi ý viết; không điền dữ kiện giả, kết quả đo giả hay trải nghiệm chưa thực hiện. Tách nhận xét cá nhân khỏi thông tin xác minh được.

## Cách sử dụng
1. Vào Editor, bật **Viết bài theo Series**.
2. Tại **✦ Mẫu dàn ý Series → Chọn dàn ý**, chọn một trong hai mẫu Review mới.
3. Hệ thống **chèn thêm** Markdown vào nội dung bài hiện tại (không ghi đè bài cũ). Bạn có thể sửa, thêm ảnh, dẫn nguồn và lưu lên Blogger/Google Drive như trước.

## Phạm vi mã nguồn
- `apps/web/src/components/seriesBlueprints.js`: dữ liệu 6 mẫu dàn ý, có thể kiểm tra bằng Node mà không cần biên dịch JSX.
- `apps/web/src/components/BlueprintSelector.jsx`: dùng danh sách chung, hiển thị số lượng động.
- `apps/web/test/seriesBlueprints.test.mjs`: kiểm thử số lượng, ID, tính đầy đủ, cảnh báo spoiler và hướng dẫn kiểm chứng.

Không thay đổi authentication, hành vi Blogger Publish, Drive, Series metadata hay theme light mode.

## Chạy kiểm thử
```bash
npm ci
npm run check
npm run build
```

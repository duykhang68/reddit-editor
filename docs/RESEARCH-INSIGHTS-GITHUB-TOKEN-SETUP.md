# Khắc phục GH_FORBIDDEN — kết nối Research Insights với GitHub qua Cloudflare

> **Duy Nguyen · Reddit Editor** · Hướng dẫn thực hành · Cập nhật: 07/11/2026  
> **Repository:** [duykhang68/tetdinhmuiblog](https://github.com/duykhang68/tetdinhmuiblog)  
> **Dashboard:** [Research Insights](https://duynguyen-reddit-editor.pages.dev/research-insights)  
> **Mục tiêu:** Khắc phục \`GH_FORBIDDEN\` ở nguồn **GitHub Issues** và **GitHub Actions**. Không sửa source code hoặc công khai token.

## 1. Hiểu đúng lỗi

Thông báo:

\`\`\`text
Không đọc đủ dữ liệu từ GitHub.
Issues: GitHub từ chối quyền truy cập Issues/Actions. (GH_FORBIDDEN)
Actions: GitHub từ chối quyền truy cập Issues/Actions. (GH_FORBIDDEN)
\`\`\`

Có nghĩa là backend không lấy được các nguồn GitHub cần dùng. Trong mã hiện hành, \`GH_FORBIDDEN\` ứng với phản hồi HTTP **403** từ GitHub **khi không phát hiện rõ đã hết rate-limit**. Có thể do token thiếu quyền, token không có quyền truy cập repository, hoặc giới hạn/chính sách GitHub khác. **Chỉ từ thông báo này chưa thể khẳng định chính xác nguyên nhân**; hãy kiểm tra lại token và cấu hình trước.

Dashboard gọi hai endpoint GitHub:

| Nguồn | Endpoint | Quyền cần có (fine-grained PAT) |
|---|---|---|
| Research incidents | \`GET /repos/duykhang68/tetdinhmuiblog/issues?state=all&per_page=100&sort=updated&direction=desc\` | **Issues → Read-only** |
| Pipeline runs | \`GET /repos/duykhang68/tetdinhmuiblog/actions/runs?per_page=100\` | **Actions → Read-only** |

**Lưu ý quan trọng:** Research Insights **không** dùng token GitHub đang kết nối với ChatGPT. Quyền bạn cấp cho ChatGPT/GitHub App không đồng nghĩa Cloudflare đã có thông tin xác thực.

## 2. Tạo Fine-grained Personal Access Token (PAT)

1. Đăng nhập đúng GitHub user **\`duykhang68\`**.
2. Mở **[GitHub → New fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)**.
3. Nhập:
   
   | Trường | Giá trị đề xuất |
   |---|---|
   | Token name | \`cloudflare-research-insights\` |
   | Resource owner | \`duykhang68\` |
   | Expiration | 90 days (hoặc thời hạn ngắn phù hợp) |
   | Repository access | **Only select repositories** |
   | Selected repositories | **\`tetdinhmuiblog\`** |
   
4. Mở **Repository permissions**, chọn:
   - **Actions → Read-only**
   - **Issues → Read-only**
   - **Metadata → Read-only** (GitHub tự cấp)
5. Nhấn **Generate token**. Sao chép giá trị \`github_pat_...\` ngay khi GitHub hiển thị.

> 🔒 **Bảo mật:** Không đưa token vào commit, Markdown, ảnh chụp màn hình, frontend, \`VITE_*\`, URL hoặc chat. Nếu lộ token, **revoke** ngay và tạo token mới. Không cần cấp quyền Write/Admin cho dashboard chỉ đọc. Nhớ gia hạn/thay thế token khi hết hạn.

Nếu dùng **GitHub App Installation Token** thay vì PAT, hãy xác nhận app được cài cho đúng repo và có **Issues: Read** + **Actions: Read**, đồng thời token đang còn hiệu lực. Installation token thường hết hạn nhanh và **không thích hợp dán cố định** vào Cloudflare secret nếu không có cơ chế xoay token tự động.

## 3. Lưu token trong Cloudflare Pages Production

1. Mở **[Cloudflare Dashboard](https://dash.cloudflare.com/)**.
2. Chọn **Workers & Pages** → project **\`duynguyen-reddit-editor\`**.
3. Vào **Settings → Variables and Secrets → Add** (tên có thể hơi khác theo phiên bản giao diện).
4. Chọn môi trường **Production**.
5. Khai báo:

   | Trường | Nội dung |
   |---|---|
   | Name | \`GITHUB_TOKEN\` |
   | Value | Dán token \`github_pat_...\` vừa tạo |
   | Encrypt / Type | **Secret / Encrypt** |
   | Environment | **Production** |

6. **Save**. Nếu có secret \`GITHUB_TOKEN\` cũ, **cập nhật/thay thế** giá trị cũ, không tạo mục trùng tên. Một số giao diện yêu cầu xóa secret cũ rồi tạo lại.
7. **Triển khai Production mới** để Pages Function nhận cấu hình mới: vào **Deployments** → chọn triển khai Production mới nhất → **Retry / Redeploy** (nếu UI hỗ trợ), hoặc kích hoạt một build/deploy Production mới theo quy trình repo. Chỉ đổi secret mà chưa triển khai phiên bản sử dụng secret thì có thể chưa áp dụng được.

**Điểm dễ nhầm trong dự án này:** backend hiện ưu tiên \`GITHUB_TOKEN\` rồi mới đến \`RESEARCH_GITHUB_TOKEN\`. Nếu đã có \`GITHUB_TOKEN\` nhưng token đó thiếu quyền, khai báo thêm \`RESEARCH_GITHUB_TOKEN\` **không giải quyết được**, vì backend vẫn ưu tiên biến đầu tiên.

\`\`\`js
// Minh họa từ backend (KHÔNG dán token vào code):
const token = String(env.GITHUB_TOKEN || env.RESEARCH_GITHUB_TOKEN || '').trim();
\`\`\`

Nếu project còn có môi trường **Preview**, hãy chắc chắn bạn đang đặt token ở **Production**, không chỉ Preview.

## 4. Xác nhận đã hoạt động

Sau khi triển khai Production thành công:

1. Mở **[Research Insights](https://duynguyen-reddit-editor.pages.dev/research-insights)** và đăng nhập Google OAuth như trước.
2. Nhấn **Refresh** trên dashboard.
3. Mở endpoint API trên **cùng trình duyệt/phiên Google**: **[GET /api/research-insights](https://duynguyen-reddit-editor.pages.dev/api/research-insights)**.
4. Kiểm tra JSON trả về: \`sources.issues.ok\` và \`sources.actions.ok\` đều là \`true\`.

Ví dụ **chỉ minh họa cấu trúc**, không phải số liệu thật:

\`\`\`json
{
  "sources": {
    "issues": { "ok": true, "sampleSize": 12 },
    "actions": { "ok": true, "sampleSize": 100 }
  },
  "partial": false
}
\`\`\`

Các số \`sampleSize\` ở trên **chỉ là ví dụ**, không phải thống kê của repo. Thống kê thực được backend trả về khi kết nối thành công.

| Dấu hiệu | Ý nghĩa |
|---|---|
| \`sources.issues.ok = true\` | GitHub Issues đọc được |
| \`sources.actions.ok = true\` | GitHub Actions đọc được |
| \`partial = false\` | Hai nguồn đã trả dữ liệu hợp lệ |
| \`GH_FORBIDDEN\` | GitHub từ chối HTTP 403; xem quyền token, repo và chính sách |
| \`GH_RATE_LIMIT\` | Giới hạn GitHub API, xem quota và token |
| \`GH_TOKEN_INVALID\` | Token bị từ chối, sai hoặc hết hạn |
| HTTP 401 từ **Cloudflare endpoint** | Chưa có phiên đăng nhập Google hợp lệ; khác với GitHub token lỗi |
| \`0\` cho một KPI | Chỉ là 0 nếu nguồn API đã xác minh; không đồng nghĩa mọi dữ liệu nguồn đều bị thiếu |

**Không nhập GitHub PAT vào ô Google OAuth:** hai loại xác thực hoạt động độc lập.

## 5. Nếu vẫn GH_FORBIDDEN

Kiểm tra theo thứ tự:

- [ ] Token được tạo dưới tài khoản \`duykhang68\` hoặc chủ thể thực sự có quyền trên repo này.
- [ ] Fine-grained PAT đã chọn **Only select repositories → tetdinhmuiblog** (không chọn nhầm repo/tài khoản).
- [ ] **Actions = Read-only**, **Issues = Read-only**; token còn hạn, chưa revoke.
- [ ] Cloudflare **Production** có \`GITHUB_TOKEN\` hợp lệ (không phải giá trị mẫu, không có khoảng trắng thừa).
- [ ] Nếu có \`GITHUB_TOKEN\` cũ, đã **thay thế** chứ không chỉ thêm \`RESEARCH_GITHUB_TOKEN\`.
- [ ] Bản Production đã được deploy **sau khi** lưu secret.
- [ ] Mở **Cloudflare → Pages project → Logs / Functions logs** kiểm tra request \`/api/research-insights\` nếu còn HTTP 403.

Nếu muốn kiểm chứng token độc lập, hãy dùng GitHub REST API với Authorization header **trên máy cá nhân/terminal bảo mật**, không kiểm tra bằng cách dán token vào thanh địa chỉ hoặc URL public:

- \`GET https://api.github.com/repos/duykhang68/tetdinhmuiblog/issues?per_page=1\`
- \`GET https://api.github.com/repos/duykhang68/tetdinhmuiblog/actions/runs?per_page=1\`

Phản hồi **200** cho cả hai endpoint xác nhận token có thể đọc hai nguồn ở thời điểm thử nghiệm. Nếu terminal thành công nhưng Production vẫn lỗi, ưu tiên kiểm tra **Cloudflare secret đang được deploy**, môi trường hoặc thứ tự ưu tiên biến.

> Chỉ chia sẻ **mã lỗi**, HTTP status và tên endpoint khi nhờ hỗ trợ; **không bao giờ gửi token, cookie hay header Authorization**.

## 6. Những gì *không* phải lỗi

- **Research trends** có rất ít incident là bình thường: nó chỉ đếm GitHub Issues có tiêu đề bắt đầu bằng \`[RESEARCHER]\` trong khoảng thời gian gần đây, không đếm mọi workflow/PR.
- **Active Pipelines** chỉ tính trạng thái chưa hoàn thành trong mẫu 100 workflow gần nhất.
- **Success Rate** chỉ tính workflow hoàn tất đủ điều kiện trong mẫu.
- **GA4 Website traffic** là nguồn Google Analytics **riêng**, không sửa được bằng GitHub PAT. GA4 dùng Property ID \`563038949\`, Measurement ID \`G-Z83BHS8KMY\` và OAuth \`analytics.readonly\`.

## 7. Tài liệu gốc và liên kết hữu ích

- [GitHub — tạo Fine-grained PAT](https://github.com/settings/personal-access-tokens/new)
- [GitHub — quyền cần thiết cho Fine-grained PAT](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)
- [Cloudflare — Pages Functions bindings, variables và secrets](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare — Pages deploy và cấu hình môi trường](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Tài liệu nội bộ Research Insights](./RESEARCH-INSIGHTS.md)
- [Xem backend Cloudflare thực tế](../apps/web/functions/%5B%5Bpath%5D%5D.js)
- [Mở Research Insights](https://duynguyen-reddit-editor.pages.dev/research-insights)

---

**Hoàn tất khi:** \`sources.issues.ok === true\`, \`sources.actions.ok === true\` và \`partial === false\` từ Production. Không cần tạo thêm PR hay sửa code cho bước nhập token vào Cloudflare; đây là thao tác quản lý secret trực tiếp trên Cloudflare.

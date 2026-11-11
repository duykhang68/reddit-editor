# Schedule a Post — Blogger Editor
**Repository:** `duykhang68/tetdinhmuiblog`  
**Editor:** https://duynguyen-reddit-editor.pages.dev/

## Implementation
The actual production publishing target is **Blogger**, not the Cloudflare Pages website. Cloudflare Pages hosts the editor frontend/API, and rebuilding it does not publish Blogger posts.

The Blogger v3 API natively accepts `POST /blogs/{blogId}/posts/{postId}/publish?publishDate=<RFC3339>`. The author first creates/saves a draft using the existing OAuth Blogger connection. A future `publishDate` moves the post to `SCHEDULED`; Blogger then publishes it automatically without an open browser, local machine, GitHub cron or Cloudflare deployment.

- Editor: `apps/web/src/App.jsx`, `apps/web/src/components/SchedulePost.jsx` and `schedule.css`.
- Date logic: `apps/web/src/services/schedule.js` converts a selected local wall-clock time and IANA timezone into RFC3339 with explicit offset. DST gaps are rejected.
- Production API: `apps/web/functions/[[path]].js` implements `POST /api/schedule/:postId` and `DELETE /api/schedule/:postId`.
- Local API: `apps/server/index.mjs` implements the same routes.
- `GET /api/posts?status=scheduled` reads real scheduled posts from Blogger for the account's blog.
- Both write operations require authenticated Google OAuth session and CSRF token. Server validates blog, post ID, future timestamp and `expectedUpdated` for optimistic concurrency.
- Reschedule: revert `SCHEDULED` post to `DRAFT`, then call Blogger publish with a future date. If Blogger fails after revert, a visible error tells the user to refresh their drafts; never claim the schedule succeeded.
- Cancel: Blogger `revert` converts the scheduled post to a draft. Cancelling does not delete its content.
- LocalStorage: `dn-editor-scheduled-v1-<blogId>` caches recent post IDs/titles/times only. It is **not** the publication queue nor the source of truth.
- Google Drive Markdown: `serializeArticle` writes one YAML frontmatter (compatible with existing Series metadata) containing `date`, `publishDate`, `draft: false`, `scheduled: true`. The Blogger API stores a scheduled post; YAML is for portable Markdown, not part of the Blogger body.

### Example Markdown
```yaml
---
date: 2026-11-08T09:00:00+07:00
publishDate: 2026-11-08T09:00:00+07:00
draft: false
scheduled: true
---
```

## Why no `.github/workflows/scheduled-build.yml`?
The existing repository is a React/Vite **Blogger editor**, not a Hugo/Markdown-published website. A Cloudflare Pages rebuild on a GitHub cron cannot publish a Blogger post. Running GitHub Actions for this would incur work without making a scheduled post live. GitHub cron also runs at a minimum 5-minute frequency and can be delayed. Blogger itself schedules posts reliably; use that provider-native mechanism. Do not create redundant release/deploy workflows or duplicate publication actions.

## QA
Run `npm ci && npm run check && npm run build`. Validate Cloudflare Pages Functions deployment as well as frontend, because deploying only `apps/server` is insufficient for production.

Manual E2E: sign in to Blogger; select a blog; create a draft; schedule it for a future time; confirm Blogger reports `SCHEDULED`; refresh page and open **Drafts & Posts → Đã lên lịch**; modify the scheduled time and check Blogger; cancel and confirm the article returns to Drafts; verify Google Drive Markdown YAML and local time offset. Test timezone conversion and error path with expired/missing Google OAuth. Never claim production deployment until Cloudflare Pages has published the merged commit and its API is responding.

# Editor · Danh sách bài viết & Drive-safe deletion (2026-11-08)

## Route and placement
Existing Editor homepage: `/`. A visible `PostLibrary` section sits immediately below `kit-paper` (composer) in the central editor stack, before the existing ScheduledQueue. No separate utility route is added.

## Workflow
1. Fetch real posts from the existing authenticated Blogger `GET /api/posts` endpoint, with draft / live / scheduled filters, text search within loaded pages, and pagination.
2. Select a post, choose **Edit**: fetch full original HTML, labels, and series through `GET /api/posts/:id`. Editing a LIVE post is supported through authenticated `PATCH /api/posts/:id`; SCHEDULED posts remain read-only pending schedule cancellation. Revision checks reject stale updates.
3. **Save backup to Drive**: user must connect Drive through the existing panel. A new immutable JSON document, tagged `dn_editor_post_backup=v1` and `blog_id`, stores original Blogger ID, status, content, labels, and update time. New Drive service `savePostBackup` immediately reads back and compares the entire JSON.
4. **Delete**: two separate confirmations; retrieve the current full Blogger post, upload and read-back a new `pre-delete` backup, check content/revision/identity, then call `DELETE /api/posts/:id` with CSRF, blog, expectedUpdated and backup reference. If backup fails, no delete call. Backend re-fetches current Blogger revision and rejects mismatch (409).
5. **Restore from Drive**: list isolated backups for current blog; select one; open its content as a NEW unsaved Editor draft, without restoring old Blogger ID or automatically publishing. User reviews HTML and manually saves to Blogger.

## Guarantees / constraints
- UI never deletes when Drive isn't authenticated or read-back fails.
- Backend requires backup reference and checks revision/target, but cannot independently attest Drive file contents because Blogger OAuth has only Blogger scope; browser backup check is not a substitute for server-side Drive attestation against malicious API clients.
- Restore doesn't resurrect original URL, comments, SEO history or the old Blogger post ID. Recreating a draft produces a new ID.
- Drive token stays in memory; no access tokens saved in localStorage.
- Drive `drive.file` scope only sees files this app creates, so other files are not silently imported.
- Production build and API integration need confirmation from CI and browser. No post has been deleted during development.

## QA
- Load Blogger draft/live/scheduled lists; verify search, pagination, mobile layout.
- Open draft, LIVE and scheduled posts; edit and save published content, preserve legacy HTML.
- Reject stale `expectedUpdated` updates/deletes.
- Disconnect Drive; assert delete disabled. Simulate Drive POST/read-back failures; assert zero Blogger DELETE calls.
- Successful backup + confirmation invokes one Blogger delete and refreshes list.
- Restore backup opens a new unsaved draft only; Blogger remains unchanged until explicit save.
- Verify Cloudflare Pages and local server behave the same.

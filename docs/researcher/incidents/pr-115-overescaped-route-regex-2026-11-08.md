# CI incident: PR #115 · invalid regular expression flags

Date: 2026-11-08 (UTC+07)
PR: https://github.com/duykhang68/tetdinhmuiblog/pull/115
Failed CI: https://github.com/duykhang68/tetdinhmuiblog/actions/runs/42447508801
Failed job: 128629440690 (Node 22)
Original head: `97857ea2bec2479762c22c36b0c4dfb1cf123ab2`

## Evidence and root cause
`Syntax and automated tests` failed: 203 tests, 199 passed, 4 failed. The four failing suites attempted to import `apps/web/functions/[[path]].js`, whose new post-route regex at line 153 had redundant backslashes and could not be parsed. Node printed `SyntaxError: Invalid regular expression flags`. The production frontend build was skipped, so Cloudflare also reported build failed.

## Fix
Changed the production route test to the valid JS literal `/^\\/api\\/posts\\/\\d+$/` in `apps/web/functions/[[path]].js`. Kept the Blogger route and business logic unchanged.
Added `apps/web/test/editorPostRouteSyntax.test.mjs` to check both production and local server JavaScript syntax and the numeric post route pattern.
Added the prevention policy to `AGENTS.md`.

## Reusable debugging playbook
- Group multiple failed suites by their *first shared stack trace* and broken imported module, rather than treating each suite as a separate issue.
- For newly generated routes / regex literals, run `node --check` immediately, before expensive integration tests.
- Avoid double escaping in nested JavaScript template strings. The content of the **file on GitHub** is definitive, not the JSON representation in a tool response.
- Run regression tests, full tests, production build, then verify that the latest HEAD CI and Cloudflare checks are green before merge.
- Keep deletion blocked if Drive backup or readback fails. Do not test destructive endpoints on the real user's blog.

## Verification
Pending newest HEAD GitHub Actions / Cloudflare checks. Do not mark this incident verified until those checks pass.

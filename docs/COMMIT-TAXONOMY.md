# Commit classification on main

GitHub offers **Labels for issues and PRs**, but not for Git commits. The workflow `.github/workflows/commit-taxonomy.yml` therefore creates a **commit status context** such as `taxonomy/type:fix` on each new main commit, and adds a `type:fix` label to the associated merged PR.

## Supported types

| Prefix | Meaning |
| --- | --- |
| `feat:` | New feature |
| `fix:` | Bug fix |
| `hotfix:` | Urgent production fix |
| `docs:` | Documentation |
| `ci:` | GitHub Actions / delivery automation |
| `refactor:` | Internal restructure, no intended behavior change |
| `test:` | Tests |
| `perf:` | Performance |
| `security:` | Security hardening |
| `build:` | Toolchain / build |
| `chore:` | Maintenance |
| `revert:` | Revert |
| No recognized prefix | `other` |

Example titles: `feat(editor): add preview toolbar`, `fix(oauth): handle expired session`, `ci: add quality gate`.

## What happens

- On each push to `main`, GitHub Actions assigns a commit status for each commit in the push and adds a label to merged PR(s).
- On manual dispatch (Actions → Commit taxonomy → Run workflow), it can backfill the last 1–100 commits; default 30.
- Labels are mutually exclusive under `type:`, so reclassification removes stale `type:` PR labels.
- Commit statuses do **not** change commit IDs or Git history.

## Caveats

A status is not a native commit Label, and the GitHub UI may list it in the commit's checks/status area rather than a colored pill next to each row in the commit history.

Do **not** make dynamic taxonomy status contexts required checks under branch protection. Require the stable **Test and build (Node 22)** CI job instead. For merge commits, the workflow reads the associated PR title to classify its type; for ordinary commits, it reads the commit message.

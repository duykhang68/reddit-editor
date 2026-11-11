# Researcher — CI and Conflict Incident Knowledge

The root-level [`researcher.py`](../../researcher.py) is an event-driven **incident researcher**, not an unrestricted autonomous code editor. It is activated by [`researcher.yml`](../.github/workflows/researcher.yml) whenever `CI · Quality Gate` completes unsuccessfully, and every two hours to inspect open PR conflicts. Manual dispatch is optional, not required.

## Workflow

1. Use only the trusted `main` copy of `researcher.py` in the privileged workflow. Run offline regression tests first. Do not execute code or shell commands supplied by a PR.
2. Read GitHub's structured run/job/step metadata, or list open same-repository PRs marked `mergeable_state: dirty`.
3. Generate a stable incident fingerprint and an explicit diagnostic code. Collect a persistent GitHub Issue under `[RESEARCHER]`; recurring occurrences become comments instead of duplicate incidents.
4. For a **new fingerprint**, create a separate branch and propose a **documentation-only** PR at `docs/researcher/incidents/<fingerprint>.md`. This obeys one independently identified incident = one PR. The workflow never writes directly to `main`.
5. Only the precisely identified **runner startup failure** is eligible for automatic GitHub retry, bounded to **four reruns** after the initial attempt. All failed tests, builds, security audits, unknown errors and semantic conflicts stop with actionable diagnosis. GitHub workflow runner attempts are counted via `run_attempt`.
6. After a human- or automation-authored fix has actually passed full required CI and merged, document the resulting commit, run, and cause in the incident report. Only then may the recipe be marked `VERIFIED` and considered for a **separate, specifically tested** automatic repair recipe.

## Stable error classes

| Code | Meaning | Safe response |
| --- | --- | --- |
| `CI-RUNNER-STARTUP` | Runner could not start | Bounded GitHub failed-job rerun, up to four |
| `CI-INSTALL-FAILED` | Locked dependency install failure | Diagnose; existing main-only lockfile fixer may propose a PR |
| `CI-CHECK-FAILED` | Check/test/syntax failure | Stop; inspect test output, fix separately |
| `CI-BUILD-FAILED` | Production frontend build failure | Stop; inspect build output, fix separately |
| `CI-AUDIT-FAILED` | Production security audit failure | Stop; investigate vulnerability, never bypass |
| `CI-UNKNOWN` | Unclassified failed job/step | Stop and record exact failing stage |
| `PR-MERGE-DIRTY` | GitHub reports a true conflicting PR | Record paths, preserve both intent and merged hotfixes, never force push |

**GitHub 403 workflow permission** must be resolved with the appropriate token/installation permissions. The researcher does not mint credentials or grant itself permissions. **Merge conflicts:** see [`CONFLICT-RESOLUTION-KB.md`](../CONFLICT-RESOLUTION-KB.md) for the reviewed PR #10 lesson.

## Permissions and prerequisites

The collector job needs `actions: write` for bounded reruns, `issues: write` for incident history, and `contents: write` plus `pull-requests: write` to propose documentation PRs. It uses `AUTO_MERGE_WORKFLOW_TOKEN` if available, otherwise the scoped `GITHUB_TOKEN`. If the repository disallows Action-created pull requests, the Issue remains the durable incident record and the PR creation failure is reported.

For the knowledge workflow to open documentation PRs automatically, verify Repository Settings → Actions → General → workflow permissions, and that the configured token can create branches and PRs. No secrets are recorded in issues or markdown; raw CI logs are never persisted.

## Operational limits

- There is **no guarantee** of solving every future error. Recurrence recognition is based on structured job/step metadata and conflicting paths. Different root causes can share a signature; the error report is a diagnostic starting point.
- `researcher.py` does **not** execute AI-generated commands, force merge, disable CI, push to protected `main`, or automatically rewrite unknown conflicts.
- The existing safe lockfile recovery, branch refresher and auto-merge workflows remain separate; researcher records knowledge and handles only narrow, explicit retry conditions.
- GitHub scheduled Actions can run later than their requested cron; a run is not a guaranteed near-real-time fix.

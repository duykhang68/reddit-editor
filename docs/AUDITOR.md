# Auditor: five-day CI failure audit

The new root-level `auditor.py` scans **current** GitHub Actions failure states, cross-references verified guidance in `researcher.py` and past GitHub incidents, and researches related Stack Overflow discussions as **unverified references only**.

## Scheduling and cost

The GitHub workflow `.github/workflows/auditor.yml` performs **one scan every five UTC calendar days**, anchored to **2026-11-07**. The first scheduled scan after the change is eligible on **2026-11-12 at 03:17 UTC (10:17 Asia/Ho_Chi_Minh)**, assuming the workflow is merged and GitHub's scheduler fires normally.

Why not `*/5` in the day-of-month field? That resets every month; it is *not* every five consecutive days. Instead a lightweight workflow checks eligibility once daily at 03:17 UTC and executes the auditor's code only on a due day. On other days, the job exits successfully with `AUDITOR_NOT_DUE` and does not perform checkout, setup Python, tests, GitHub API polling, or artifact upload.

Each due run executes `python auditor.py --cycles 1` (**one scan; no internal one-minute polling/sleep loop**). A manual **Run workflow** launches a single scan immediately, regardless of the five-day schedule. GitHub scheduled runs are best effort and may be delayed or dropped under load; if monitoring must be timely, use event-driven Cloudflare webhook monitoring as described in [Cloudflare GitHub monitoring proposal](CLOUDFLARE_GITHUB_MONITORING.md).

This reduces runner time drastically compared with the previous every-five-minutes workflow that kept a runner idle between five one-minute samples. `CI · Quality Gate` and `Auto Approve and Merge · CI Green` are deliberately unchanged.

## Automatic response

1. Read up to 100 recent Actions runs plus current `main` and open PR commit SHAs. Only the **newest matching workflow run on an active HEAD** is considered actionable; old red X marks on superseded commits remain history.
2. Use existing `researcher.py` error-code taxonomy, GitHub's failed job/step metadata, and persistent `[RESEARCHER]` incidents to find prior recovery experience.
3. Research Stack Overflow using its public Stack Exchange search API. Only links, question titles and scores are collected. External suggestions are never executed or treated as validated instructions.
4. Open **one GitHub Issue per failed run** containing exact code, affected run, failing stage, prior knowledge and advisory research. Further scans reuse the same Issue.
5. Retry only a confirmed runner startup failure, **at most four times** after the initial attempt. If a known dependency-install failure affects a failed push CI on `main`, dispatch the existing restricted `Self-Healing` recovery workflow once. Other failures stop with a clear incident code and require a separately tested **one fix = one PR**.
6. Record the single-scan result in `auditor.md`, uploaded as a workflow artifact and posted in the Actions job summary. Permanent incident history lives in GitHub Issues.

## Error and safety rules

- `CI-RUNNER-STARTUP`: bounded, deduplicated failed-job reruns, maximum four
- `CI-INSTALL-FAILED`: one dispatch to the existing safe main-only lockfile recovery, if applicable
- `CI-CHECK-FAILED`, `CI-BUILD-FAILED`, `CI-AUDIT-FAILED`: stop; report actual failing stage and require proper CI-verified fix
- `CI-UNKNOWN`: stop and research; do not assume rerunning changes anything
- `AUDITOR-PROCESSING-ERROR`: report GitHub API or incident processing failure rather than declare green

The auditor never force-pushes, bypasses Rulesets, tampers with historical check conclusions, writes directly to `main`, or runs arbitrary Stack Overflow/AI-generated code. A later successful CI run on the current commit is required to consider a regression resolved.

## Usage

Workflow: **Auditor · Five-Day CI Failure Audit** (the five-day cadence takes effect after this PR merges into `main`). Use *Run workflow* for an immediate single scan.

For a local single scan, with appropriate GitHub credentials and network access:

```bash
GITHUB_REPOSITORY=duykhang68/tetdinhmuiblog GITHUB_TOKEN=... python3 auditor.py --cycles 1
```

For offline regression checks:

```bash
python3 -m unittest discover -s tests -p test_auditor.py -v
```

Only GitHub Issue numbers, workflow metadata, sanitized stages and Stack Overflow links are persisted. Raw job logs and credentials are not copied into Issues or reports.

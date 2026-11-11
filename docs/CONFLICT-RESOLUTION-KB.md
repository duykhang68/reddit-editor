# Conflict Resolution Knowledge Base

## Incident CF-20261106-PR10 — Workflow version labeling

**PR:** [#10](https://github.com/duykhang68/tetdinhmuiblog/pull/10)
**Affected file:** `.github/workflows/pr-fix-version.yml`
**Symptom:** GitHub reports `mergeable_state: dirty` and "This branch has conflicts that must be resolved".
**Root cause:** Both `main` and the PR independently edited the same YAML workflow. The base fixed PR label permissions (`pull-requests: write`), while the feature branch introduced automatic reconciliation of open PR labels. Blindly choosing "ours" or "theirs" risks dropping one of those fixes.
**Resolution:** Preserve the newest `main` tree as the baseline; keep the tested PR workflow implementation that includes the corrected `pull-requests: write` permission. Create an ordinary two-parent merge commit (first parent = current PR HEAD, second parent = the exact `main` SHA) and update the PR branch without force pushing, using an expected-head lease.
**Resolved merge commit:** `c652d3d2852ef1b3b8edca83fa408ccfebf26f42`. Verify a fresh CI run on that exact SHA before merging.

## Recovery procedure for future cases

1. **Diagnose precisely.** Fetch current PR `head.sha`, current `main` SHA, `mergeable_state`, changed paths and both file versions. Do not treat `behind` (clean update) as `dirty` (true conflict).
2. **Determine intended semantics.** Inspect the PR diff and all later fixes already merged into `main`. Resolve every conflicting line according to desired behavior; never discard security/permissions hotfixes just because the feature branch version is older.
3. **Build a safe merge commit.** Use the current `main` Git tree as baseline, apply *only* reviewed conflict resolutions to that tree, create a merge commit with PR HEAD as first parent and current `main` as second parent, then fast-forward the existing PR branch with an expected SHA lease. Never force-push or mutate `main` directly.
4. **Verify.** Read the resolved file from the updated PR branch, confirm the PR is no longer `dirty`, wait for required `Test and build (Node 22)` check on the new exact head SHA, and let the configured GitHub merge rules apply.
5. **Record the outcome.** Add root cause, resolved file, merge SHA, and CI run URL to the PR or this runbook. If any check fails, keep the PR open and provide a specific error, rather than declaring the conflict resolved and the PR merged.
6. **Prevent recurrence.** For workflow changes, preserve required token permissions and avoid concurrent edits to the same workflow where possible. One independent feature or hotfix per PR.

## Automation boundaries

The existing `Conflict Fixer · Safe Branch Refresh` can safely update an unconflicted outdated PR via GitHub's update-branch API. It intentionally **does not** automatically guess semantic resolutions of `dirty` merges.

A future automated recipe can handle a *precisely fingerprinted* conflict only if it validates the current branch and base SHAs, checks every affected path against an allowlist, preserves the relevant permission fix, creates a merge commit without force, and runs full CI. Unrecognized conflicts must stop with actionable information; do not assume the same merge recipe is safe for unrelated code.

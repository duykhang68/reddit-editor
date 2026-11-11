# Versioning & Fix Version — tetdinhmuiblog

## Policy

Use **Semantic Versioning**: `vMAJOR.MINOR.PATCH`.

| Change | PR title example | Release impact |
| --- | --- | --- |
| Breaking API/behavior change | `feat!:` or `fix(api)!:` | major |
| New backward-compatible feature | `feat(editor): add toolbar` | minor |
| Bug fix / CI hotfix / documentation | `fix(oauth): refresh token`, `ci: ...`, `docs: ...` | patch |

An automation attached to each same-repository PR targeting `main` adds:
- `release:patch`, `release:minor`, or `release:major`
- `fix-version:vX.Y.Z` — **planned target** computed from the latest published stable GitHub Release, or the root package version if no stable Release exists.

**Important:** The PR label shows a **proposed** release target and is not proof that version has been published. Multiple PRs can share the same planned version, and the version may move if another release ships first. To know which version actually contains a fix, use the Git tag / GitHub Release associated with the deployed artifact.

## Recommended workflow

1. Create a PR with a Conventional Commit title, e.g. `fix(auth): resolve stale session`.
2. Check automated labels `release:patch`, `fix-version:v1.0.1`. If the title changes, the labels are recalculated.
3. Merge when CI and all ruleset checks pass.
4. Once ready for delivery, run **CD · Versioned Release (No Live Deployment)** from `main` with a new version tag (e.g. `v1.0.1`). This workflow builds and publishes a GitHub Release with auto-generated notes and a SHA256-protected frontend artifact.
5. Record the release in CHANGELOG and use the release's commit SHA to identify precisely what shipped.

A GitHub Release is a downloadable versioned artifact; the current workflow **does not deploy** the Node.js backend. Do not claim a fix is live simply because a release tag was created.

## Existing baseline

Current root `package.json` reports `1.0.0` and no stable GitHub Releases were found during setup. Treat this as the versioning baseline, **not** a confirmed production release. We do not rewrite existing commits or retroactively publish `v1.0.0`.

## Manual reclassification

Actions → **Release Version · Label Pull Requests** → Run workflow → supply an **open** PR number. Only PRs from this repository into `main` are eligible.

## Automation boundaries

The workflow never merges a PR, edits source code, or creates a release. GitHub's Ruleset still controls required tests. The labels provide traceability, not deployment verification.

# CI/CD merge and deployment policy

## PR quality gate
- `CI · Quality Gate` runs on every pull request into `main`.
- Locked `npm ci`, syntax checks and automated tests (`npm run check`), production build (`npm run build`), and production dependency audit (`npm audit --omit=dev --audit-level=high`) must pass.
- This repository does not currently define a dedicated lint command; syntax checks are not a replacement for a full ESLint rule set.

## Auto-merge
- Only open, non-draft, same-repository PRs can be considered.
- The latest HEAD SHA must have a successful `Test and build (Node 22)` check.
- When main has advanced, refresh the PR branch and wait for CI on the new SHA.
- GitHub must report a clean, mergeable PR, and GitHub's server-side branch protection/rulesets are authoritative.
- No bot approval is supplied to bypass human-review requirements.
- Workflow, Actions and CODEOWNERS changes are **automatically merged** after the same green CI and conflict/rules checks, provided `AUTO_MERGE_WORKFLOW_TOKEN` has the required repository permissions. No per-PR manual approval is part of this workflow.
- If a privileged credential is absent or expired, only sensitive PR merges are paused with `TOKEN_SETUP_REQUIRED`/`BLOCKED_WORKFLOW_PERMISSION`; the schedule retries automatically after the credential is configured. A token must not be printed in logs.

## One-time elevated token for automatic workflow merges
Configure repository secret `AUTO_MERGE_WORKFLOW_TOKEN` in Settings > Secrets and variables > Actions. Use a GitHub App installation token minted by a trusted workflow with **Contents: write**, **Workflows: write**, and appropriate Pull requests access, or a fine-grained personal access token scoped to this repository with Contents and Workflows write permissions. The default `GITHUB_TOKEN` cannot be granted the missing workflow-edit capability through the YAML permissions block. Rotate and minimize access to this credential. Never paste it into PRs or job logs. When a ruleset requires a human review, GitHub will continue to enforce that review, independent of CI success.

## Branch protection configuration (repository administrator)
GitHub Settings > Rules > Rulesets: protect `main` and require `Test and build (Node 22)`, prevent force-push and deletion, require pull requests, enforce review policy where desired, and disallow bypass for automation identities. Set required checks using a recent successful run. Only administrators can change repository rules; workflows cannot guarantee a ruleset is configured.

## Release and deployment
- `CD · Versioned Release (No Live Deployment)` builds, checks archive integrity and HTML, and publishes a versioned GitHub release.
- This repository has no configured production host/backend deployment in these workflows. Publishing a release is **not** deploying an application.
- After deploying to a real public HTTPS host, use `CD · Post-deploy Verification` with `deployment_url` to verify the deployed endpoint.
- Production deployment must be configured for a chosen host/provider separately; protect deployment environments and secrets using GitHub Environments.

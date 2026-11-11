# CI/CD runbook — tetdinhmuiblog

## Current architecture

This is an npm-workspaces monorepo: React/Vite frontend in `apps/web`, Node.js Blogger OAuth API in `apps/server`.
Vite proxies `/api` and `/auth` to localhost:3000 in development. The UI alone is **not** a functional public deployment. Never publish the server's `.env`, encrypted sessions or OAuth client secret to a static hosting provider.

## Pull request workflow

1. Branch from `main` using `feat/<name>`, `fix/<name>` or `chore/<name>`.
2. Make a focused change and run `npm ci && npm run check && npm run build` locally.
3. Open a PR against `main`. CI runs the Node 22 syntax checks, tests, production build, and production dependency audit.
4. Review the PR and merge only if required checks pass. Prefer squash merge and avoid direct pushes.

## Repository settings (administrator action)

Go to Settings → Rules → Rulesets → New branch ruleset, target `main`:
- Require pull request before merging, ideally one independent approval for multi-person teams.
- Require status check **Test and build (Node 22)** after the first successful CI run.
- Require branch up to date before merging if linear integration is needed.
- Block force pushes and deletion. Include administrators when feasible.
- Prefer squash merging; disable unnecessary merge methods if appropriate.
- Enable Dependabot alerts / dependency security scanning in Security settings when available.

GitHub connector integration does not expose repository ruleset mutations. Configure these settings in the GitHub UI. Some settings depend on your plan and private-repository eligibility.

## Release

After a reviewed PR merges to main, the CI workflow validates code and archives the production frontend bundle under that commit SHA.

For a versioned release, open Actions → **CD · Versioned Release (No Live Deployment)** → Run workflow, select `main` and enter a fresh SemVer tag such as `v1.0.0`. It reruns quality checks and publishes a checksum-protected frontend bundle to GitHub Releases. The release is not production hosting.

## Production deployment — integration needed

**Do not enable automatic public deployment yet.** Decide where the Node backend and same-origin frontend will run (for example a Node-capable server/container, or explicitly redesign the app for static hosting). Configure an HTTPS domain, secure session storage, `COOKIE_SECURE=true`, production OAuth redirect URIs and allowed origins, and a safe persistent storage strategy.

Once the target is decided, add a separately reviewed deployment workflow with:
- GitHub Environment `production`, approval and environment-scoped secrets;
- OIDC or short-lived credentials instead of long-lived tokens, if supported;
- concurrency group to prevent overlapping deploys;
- deploy by immutable commit SHA or release artifact, not unreviewed source;
- health checks and rollback to a previous known-good release.

## Rollback

For a failed source change, use GitHub's **Revert** PR and pass CI before merging. For a release package, download the previously approved asset and validate its `.sha256` checksum. A hosting-specific rollback command cannot be safely defined until the hosting target exists.

## Security

Do not place Google OAuth client secrets, Blogger tokens, local `.env` files, encrypted sessions, or provider credentials into a GitHub commit, Actions log or frontend environment variable with a `VITE_` prefix.

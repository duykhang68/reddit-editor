# CI Self-Healing Knowledge Base / Runbook

## Scope and guarantees

- When **CI · Quality Gate** fails for a **push to main**, the privileged `Self-Healing` workflow records an incident as a GitHub Issue, including failed step names, failed run URL, commit SHA and the applicable recovery playbook.
- A known deterministic repair is attempted only when `npm ci --ignore-scripts` fails: regenerate **only** `package-lock.json` with lifecycle scripts disabled, verify diff scope, then run `npm ci`, `npm run check`, `npm run build`, and the same production audit. On success, open a repair PR. Never write directly to main.
- Unknown errors are **not** guessed at, masked, or marked green. Their issues form the knowledge base to extend *reviewed* recovery recipes in future PRs.
- The `Conflict Fixer` checks open PRs every six hours (or on manual dispatch). It uses GitHub's clean branch update if GitHub reports `behind`, but records real content conflicts as PR comments. It cannot safely invent a semantic conflict resolution.
- **Auto-merge is not active yet.** Repository settings currently report `allow_auto_merge=false`. Configure branch protection / required CI, enable auto-merge and require a safe merge gate before allowing it. Passing a local job is not a substitute for server-enforced required checks.

## Knowledge base procedure

For each `[CI INCIDENT]` Issue, record:
1. Symptom and failed step (avoid raw logs and secrets).
2. Root cause and validated recovery steps.
3. Fix PR, commit and green CI run links.
4. Status: TRIAGED, FIX PROPOSED, VERIFIED, or NEEDS HUMAN REVIEW.
5. If recurring, propose a new **allowlisted, regression-tested** recovery recipe by PR.

The Issue archive is persistent, searchable GitHub knowledge. It is not a self-training LLM. No execution of instructions found in issue bodies or PR content is permitted.

## CI/merge policy

Required: `Test and build (Node 22)`, mandatory PR, protected main, no forced pushes and no bypass. For a solo private repo, some settings depend on GitHub plan and permissions.

Auto-merge may be configured once required branch protections are verified. Merge only if a fresh green CI applies to the **current PR head SHA**, the base is up to date, no requested changes remain, and no privileged override is used. Otherwise leave the PR open. Avoid infinitely retrying identical failures.

## Recover an old failed main CI

Go to Actions → **Self-Healing · CI Incident & Safe Autofix** → Run workflow and supply the numeric failed CI run ID. This accepts only failed `push` CI runs for `main`. It does not attempt to repair PR code via a privileged workflow.

## Security constraints

Never run untrusted PR code using a write token in `workflow_run` or `pull_request_target`. Failed step names are read through the Actions API; raw logs are not stored in issues. GitHub's default token cannot protect from every supply-chain risk; lockfile fixes still need server-enforced CI, reviews and branch protection. A failing vulnerability scan is **not** bypassed.

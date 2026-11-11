# Proposal: Cloudflare monitoring, GitHub CI and merge remain authoritative

Status: **architecture proposal only**. This PR does not deploy a Cloudflare Worker, modify Cloudflare settings, create GitHub webhooks, move credentials, disable CI, or alter the auto-merge workflow.

Repository: `duykhang68/tetdinhmuiblog`
Editor: `https://duynguyen-reddit-editor.pages.dev/`

## Goals

- Reduce GitHub Actions runner minutes used only for periodic observation.
- Keep GitHub as the **source of truth** for commits, pull requests, checks, workflow conclusions, repository rules and releases.
- Keep `CI · Quality Gate` on GitHub Actions for every required PR/main change.
- Keep `Auto Approve and Merge · CI Green` on GitHub with its existing safety checks and permissions. Do not implement automatic merging on the Cloudflare side.
- Serve fast, low-cost monitoring APIs for Editor dashboard widgets from Cloudflare.

## Recommended topology

```text
GitHub PR / push -> GitHub Actions CI · Quality Gate
                           |
                           +--> workflow_run completed webhook
                                     |
GitHub webhook (signed) ---------> Cloudflare Worker
                                     |
                                     +--> D1 (runs, status, incidents, delivery id)
                                     +--> Cloudflare API (read-only dashboard)
                                     +--> optionally alert on new actionable failures

Cloudflare Worker cron (every 15 min)
    -> read-only GitHub REST reconciliation (bounded, cached, conditional)
    -> D1 / dashboard

GitHub Auto Approve and Merge · CI Green
    -> checks GitHub's actual passing results for exact PR head SHA
    -> manages merge and repository writes inside GitHub, not Cloudflare

GitHub Auditor
    -> in this PR, single deep scan on a five-day UTC cadence
    -> manual workflow_dispatch remains available
```

## Division of responsibility

| Concern | Recommended owner | Why |
| --- | --- | --- |
| PR/build/tests and branch protection | GitHub Actions + GitHub rulesets | Maintains trusted status checks |
| PR approvals, safe automatic merging, rollback PR | Existing GitHub workflows | Keeps permissions and SHA checks in one authoritative place |
| CI/repository events, live status panels | Cloudflare Worker + D1 | No hosted runner needed to refresh a dashboard |
| Dashboard refresh | Cloudflare Worker API | Cache GitHub REST responses, hide tokens, add authorization |
| Periodic reconciliation | Cloudflare Cron Trigger, initially 15 minutes | Catches missed webhooks without a continuously running runner |
| Deep incident analysis | Five-day GitHub Auditor + manual execution | Retains proven Python behavior without constant hosted runner use |
| Deployment | Existing Cloudflare Pages project | Independent of GitHub CI quality checks |

## Delivery plan

1. Create a dedicated Worker named `github-monitor` and a D1 database. Implement POST `/webhooks/github` that validates `X-Hub-Signature-256` against a **Worker secret** before parsing or persisting events. Accept only the specific GitHub repository ID and subscribed event types. Never trust unsigned, unrecognized or duplicate deliveries. Use `X-GitHub-Delivery` for idempotency.
2. Subscribe to needed GitHub webhook events (for example `workflow_run`, `pull_request`, `push`, and `deployment_status` where applicable). Return 2xx promptly and process bounded writes asynchronously. Keep payloads minimal.
3. Add D1 tables for delivery ID, workflow run ID, PR number, head SHA, status, conclusion, checked time, error code and data freshness. Never store raw credentials, raw error logs or full OAuth tokens in D1.
4. Add a read-only reconciliation Cron Trigger (`*/15 * * * *`, UTC) using a **least-privilege GitHub App installation token** or server-held fine-grained token. Read no more than the relevant recent runs, use ETag/conditional requests and backoff for secondary rate limits; do not launch GitHub workflows from a scheduled reconciliation.
5. Point Editor's Research Insights, Quality Gate, Queue, and Rollback ID dashboards at an authenticated Worker endpoint backed by D1. The dashboard should show `last_seen`, `last_successful_sync`, `source=github`, and stale/error indicators rather than reporting unknown as 0 or green.
6. Stage and compare Worker data against GitHub's real workflow-run API over several deployments, including missed webhook and duplicate delivery cases. Only then remove any *separate, redundant* GitHub polling workflows. Leave CI, auto-merge and rollback security invariants unchanged.

## Security invariants

- Cloudflare has read-only access to monitoring resources. Do **not** give it repository write or workflow-dispatch rights just for status visualization.
- Protect all private dashboard data with existing OAuth/session verification; never expose GitHub tokens in browser-side `VITE_*` variables.
- GitHub remains authoritative: a cached Cloudflare `success` value is **never** accepted as proof to merge or bypass required status checks.
- If the Worker, webhook or D1 is down, GitHub Actions CI and merge behavior must continue unchanged.
- For any event-triggered actuation proposed later, require explicit allowlisted action, least privilege, SHA matching and replay protection.
- Use HMAC verification, secret rotation, rate limits, and audit logs; never execute arbitrary payload commands.

## How this saves quota

- Before: `auditor.yml` started roughly 288 runs/day and attempted 5 scans spaced by 60 seconds, keeping a hosted runner alive for several minutes each run.
- After this PR: one small daily date gate, and **one scan only every five days** (plus on-demand manual scans). No runner sleeps between checks.
- Later Cloudflare rollout: workflow-run events arrive via webhook and status panels query D1 rather than repeatedly spawning GitHub Actions. The Cloudflare read-only reconciliation does not consume GitHub-hosted runner minutes.
- GitHub's metered usage in a public repository may already be fully covered by usage discounts. This architecture primarily reduces unnecessary runner work and latency; it does not imply a paid invoice will decrease by the same gross amount.

## Cloudflare constraints and operations

- Cloudflare Cron Triggers run on **UTC**. A cron step in the day-of-month field is not a strict cross-month five-day interval.
- Cloudflare Workers Free has CPU and subrequest limits; measure the Worker on realistic webhook payloads and consider a paid tier only if necessary.
- Cloudflare deployment/administration credentials must be configured separately; this repository PR alone **does not activate Cloudflare monitoring**.
- References:
  - https://developers.cloudflare.com/workers/configuration/cron-triggers/
  - https://developers.cloudflare.com/workers/platform/limits/
  - https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
  - https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

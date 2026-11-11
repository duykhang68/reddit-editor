#!/usr/bin/env python3
"""Conservative, event-driven GitHub CI/conflict incident researcher.

Uses Python standard library only. No execution of PR code, raw log
persistence, LLM-generated patches, or direct pushes to protected main.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = "https://api.github.com"
RECIPE_VERSION = 1
MAX_RUN_ATTEMPTS = 5  # Initial CI attempt plus at most four infrastructure retries.
RULES = {
    "CI-INSTALL-FAILED": (
        "Install exact locked dependencies",
        "CI dependency installation failed. Check package-lock.json versus package.json. "
        "The existing self-healing lockfile recipe is limited to main and must pass full CI.",
    ),
    "CI-CHECK-FAILED": (
        "Syntax and automated tests",
        "Check the failing test or syntax diagnostics. Do not rerun a deterministic "
        "source failure or edit code speculatively.",
    ),
    "CI-BUILD-FAILED": (
        "Production frontend build",
        "Check Vite and TypeScript build output; validate the exact affected source "
        "with tests before opening an isolated fix PR.",
    ),
    "CI-AUDIT-FAILED": (
        "Audit production dependencies",
        "Security audit failed. Investigate vulnerability advisory; never bypass "
        "audit or lower its required severity.",
    ),
}
CONFLICT_RECIPE = (
    "Read both versions of the conflicting file and the PR diff. "
    "Preserve previously merged permissions/security fixes. "
    "Update clean 'behind' branches with GitHub's update-branch API; "
    "never guess a semantic resolution of 'dirty' conflicts or force-push. "
    "For the reviewed PR #10 case, see docs/CONFLICT-RESOLUTION-KB.md."
)


def clean(value: object, limit: int = 180) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ")
    return re.sub(r"[^\w .,/:#()@+\-]", "_", text)[:limit]


def fingerprint(kind: str, signature: str) -> str:
    digest = hashlib.sha256((kind + ":" + signature).encode()).hexdigest()[:12].upper()
    return kind + "-" + digest


class GitHub:
    def __init__(self, token: str, repository: str) -> None:
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
            raise ValueError("GITHUB_REPOSITORY must be owner/repository")
        self.repository = repository
        self.token = token
        self.base = "/repos/" + repository

    def call(self, method: str, path: str, payload: object = None):
        url = API + (path if path.startswith("/repos/") else self.base + path)
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "tetdinhmuiblog-researcher/1.0",
                **({"Content-Type": "application/json"} if payload is not None else {}),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as result:
                raw = result.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            details = exc.read(1000).decode("utf-8", errors="replace")
            raise RuntimeError(
                "GH-API-" + str(exc.code) + " " + method + " " + url.split("?")[0]
                + ": " + clean(details, 250)
            ) from exc

    def paged(self, path: str, max_pages: int = 5):
        rows = []
        for page in range(1, max_pages + 1):
            joiner = "&" if "?" in path else "?"
            items = self.call("GET", path + joiner + "per_page=100&page=" + str(page))
            if not isinstance(items, list):
                raise RuntimeError("GH-API-PAGINATION returned non-list")
            rows.extend(items)
            if len(items) < 100:
                return rows
        print("WARN RESEARCHER-PAGINATION limit reached", file=sys.stderr)
        return rows


def classify_ci(run: dict, jobs: list[dict]) -> dict | None:
    if run.get("conclusion") not in ("failure", "timed_out", "startup_failure"):
        return None
    steps = sorted({
        clean(s.get("name"), 110)
        for job in jobs if job.get("conclusion") in ("failure", "timed_out", "startup_failure")
        for s in job.get("steps", [])
        if s.get("conclusion") in ("failure", "timed_out")
    })
    failed_jobs = sorted({clean(j.get("name"), 110) for j in jobs
                          if j.get("conclusion") in ("failure", "timed_out", "startup_failure")})
    if run.get("conclusion") == "startup_failure":
        code = "CI-RUNNER-STARTUP"
        guidance = "Verified runner startup failure. Safe to retry failed jobs up to four times."
    else:
        code, guidance = "CI-UNKNOWN", (
            "Unrecognized CI failure. Inspect the run's failed step and diagnose; "
            "no automatic source modification or speculative retry."
        )
        for match_code, (step_label, recipe) in RULES.items():
            if any(step_label.lower() in step.lower() for step in steps):
                code, guidance = match_code, recipe
                break
    signature = code + "|" + ";".join(steps or failed_jobs) + "|" + clean(run.get("name"))
    return {
        "kind": "CI",
        "code": code,
        "fingerprint": fingerprint("CI", signature),
        "signature": signature,
        "guidance": guidance,
        "target": clean(run.get("head_branch"), 100),
        "head_sha": clean(run.get("head_sha"), 45),
        "url": run.get("html_url", ""),
        "failed_steps": steps,
        "failed_jobs": failed_jobs,
        "run_id": run.get("id"),
        "run_attempt": run.get("run_attempt", 1),
    }


def classify_conflict(pr: dict, files: list[dict]) -> dict:
    paths = sorted(clean(f.get("filename"), 200) for f in files)
    signature = ";".join(paths)
    return {
        "kind": "CONFLICT",
        "code": "PR-MERGE-DIRTY",
        "fingerprint": fingerprint("CONFLICT", signature),
        "signature": signature,
        "guidance": CONFLICT_RECIPE,
        "target": "#" + str(pr["number"]),
        "head_sha": clean(pr["head"]["sha"], 45),
        "url": pr["html_url"],
        "failed_steps": paths,
        "failed_jobs": [],
    }


def markdown(record: dict) -> str:
    steps = record.get("failed_steps") or record.get("failed_jobs") or ["No specific step available"]
    bullets = "\n".join("- " + clean(s, 200) for s in steps)
    when = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return (
        "# Researcher incident: " + record["fingerprint"] + "\n\n"
        "- First observed (UTC): " + when + "\n"
        "- Type: " + record["kind"] + "\n"
        "- Error code: " + record["code"] + "\n"
        "- Signature: " + clean(record["signature"], 350) + "\n"
        "- Example: " + record["url"] + "\n"
        "- Target: " + record["target"] + "\n\n"
        "## Failed steps or conflicting files\n\n" + bullets + "\n\n"
        "## Reviewed recovery policy\n\n" + record["guidance"] + "\n\n"
        "## Verification required\n\n"
        "- A proposed fix must use its own PR and pass the required CI on the latest HEAD SHA.\n"
        "- Never bypass branch protection, silently drop code, or disable security checks.\n"
        "- This is a structured observation, not proof of a general or autonomous fix.\n"
        "- Mark a recipe VERIFIED only after documenting a merged fix and passing CI.\n"
    )


def find_incident_issue(gh: GitHub, title: str) -> dict | None:
    for issue in gh.paged("/issues?state=all", max_pages=5):
        if "pull_request" not in issue and issue.get("title") == title:
            return issue
    return None


def create_knowledge_pr(gh: GitHub, record: dict) -> None:
    # One unique incident = one knowledge PR. No modifications to app code.
    name = record["fingerprint"].lower()
    branch = "researcher/incident-" + name
    path = "docs/researcher/incidents/" + name + ".md"
    main = gh.call("GET", "/git/ref/heads/main")
    main_sha = main["object"]["sha"]
    try:
        gh.call("POST", "/git/refs", {"ref": "refs/heads/" + branch, "sha": main_sha})
    except RuntimeError as error:
        if "GH-API-422" in str(error):
            print("INFO RESEARCHER-BRANCH-EXISTS " + branch)
            return
        raise
    import base64
    gh.call("PUT", "/contents/" + path, {
        "message": "docs(researcher): record incident " + record["fingerprint"],
        "content": base64.b64encode(markdown(record).encode("utf-8")).decode("ascii"),
        "branch": branch,
    })
    pr = gh.call("POST", "/pulls", {
        "title": "docs(researcher): incident " + record["fingerprint"],
        "head": branch, "base": "main",
        "body": "Auto-researched incident knowledge only. One signature, one PR. "
                "No source code changes or safety bypass. Source: " + record["url"],
    })
    print("INFO RESEARCHER-KNOWLEDGE-PR " + pr["html_url"])


def record_incident(gh: GitHub, record: dict, pr_gh: GitHub | None = None) -> bool:
    title = "[RESEARCHER] " + record["fingerprint"] + " · " + record["code"]
    issue = find_incident_issue(gh, title)
    if issue:
        # Count recurrence in GitHub history without creating duplicate PRs.
        marker = "<!-- researcher-run:" + clean(record["url"], 250) + " -->"
        comments = gh.paged("/issues/" + str(issue["number"]) + "/comments", max_pages=2)
        if not any(marker in c.get("body", "") for c in comments):
            gh.call("POST", "/issues/" + str(issue["number"]) + "/comments", {
                "body": marker + "\nRecurring incident detected at " + record["url"]
                        + "\nSignature " + record["fingerprint"]
            })
        print("INFO RESEARCHER-RECURRING " + record["fingerprint"])
        return False
    issue = gh.call("POST", "/issues", {
        "title": title,
        "body": markdown(record) + "\n## State\n\nTRIAGED — not automatically repaired.\n",
    })
    print("INFO RESEARCHER-NEW-ISSUE " + issue["html_url"])
    if pr_gh is None:
        # GITHUB_TOKEN-created pull requests do not trigger the normal CI events.
        # Never create an untested PR under the incident-write token.
        print("WARN RESEARCHER-PR-TOKEN-MISSING knowledge PR not created; "
              "incident remains in GitHub Issues", file=sys.stderr)
    else:
        try:
            create_knowledge_pr(pr_gh, record)
        except RuntimeError as error:
            # A missing workflow-create-PR permission must never erase the incident.
            print("WARN RESEARCHER-KNOWLEDGE-PR-FAILED " + clean(error, 300), file=sys.stderr)
    return True


def check_ci(gh: GitHub, event: dict, pr_gh: GitHub | None = None) -> None:
    run = event.get("workflow_run")
    if not run:
        print("INFO RESEARCHER-SKIP no CI workflow_run payload")
        return
    if run.get("repository", {}).get("full_name") != gh.repository:
        print("WARN RESEARCHER-SKIP outside repository")
        return
    run = gh.call("GET", "/actions/runs/" + str(run["id"]))
    if run.get("name") != "CI · Quality Gate":
        return
    jobs = gh.call("GET", "/actions/runs/" + str(run["id"]) + "/jobs?per_page=100").get("jobs", [])
    rec = classify_ci(run, jobs)
    if rec is None:
        print("INFO RESEARCHER-CI-PASSED run #" + str(run["id"]))
        return
    record_incident(gh, rec, pr_gh)
    attempt = int(run.get("run_attempt") or 1)
    if rec["code"] == "CI-RUNNER-STARTUP" and attempt < MAX_RUN_ATTEMPTS:
        gh.call("POST", "/actions/runs/" + str(run["id"]) + "/rerun-failed-jobs", {})
        print("NOTICE RESEARCHER-SMART-RETRY " + str(attempt) + "/" + str(MAX_RUN_ATTEMPTS - 1))
    else:
        print("NOTICE RESEARCHER-SMART-STOP " + rec["fingerprint"] +
              " - " + rec["guidance"])


def check_conflicts(gh: GitHub, pr_gh: GitHub | None = None) -> None:
    prs = gh.paged("/pulls?state=open&base=main", max_pages=3)
    for pr in prs:
        if pr.get("draft") or pr.get("head", {}).get("repo", {}).get("full_name") != gh.repository:
            continue
        fresh = gh.call("GET", "/pulls/" + str(pr["number"]))
        if fresh.get("mergeable_state") != "dirty":
            continue
        files = gh.paged("/pulls/" + str(pr["number"]) + "/files", max_pages=3)
        rec = classify_conflict(fresh, files)
        record_incident(gh, rec, pr_gh)
        print("NOTICE RESEARCHER-CONFLICT-STOP PR #" + str(pr["number"]) +
              " - needs reviewed semantic resolution")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("ci", "conflicts"), required=True)
    args = parser.parse_args()
    token = os.environ.get("GITHUB_TOKEN")
    repository = os.environ.get("GITHUB_REPOSITORY")
    if not token or not repository:
        print("ERROR RESEARCHER-AUTH-MISSING GITHUB_TOKEN or GITHUB_REPOSITORY", file=sys.stderr)
        return 2
    try:
        gh = GitHub(token, repository)
        # The built-in GITHUB_TOKEN is authoritative for issue comments/retries.
        # A separate repository-write PAT is used ONLY for knowledge PRs so
        # PR creation still triggers normal pull_request CI events.
        pr_token = os.environ.get("RESEARCHER_PR_TOKEN", "")
        pr_gh = GitHub(pr_token, repository) if pr_token and pr_token != token else None
        if args.mode == "ci":
            with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as file:
                check_ci(gh, json.load(file), pr_gh)
        else:
            check_conflicts(gh, pr_gh)
    except (RuntimeError, ValueError, OSError, KeyError) as exc:
        print("ERROR RESEARCHER-EXECUTION " + clean(exc, 400), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

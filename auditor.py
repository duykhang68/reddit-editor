#!/usr/bin/env python3
"""Audit current GitHub Actions failures; never rewrite historical outcomes.

Python standard library + trusted researcher.py. Community findings are
advisory, never executed. Only safe proven recovery recipes may run.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from researcher import GitHub, classify_ci, clean

MAX_ATTEMPTS = 5  # One initial attempt and four retries
ISSUE_MARKER = "<!-- auditor-managed -->"


def active_heads(gh):
    heads = {"main": gh.call("GET", "/git/ref/heads/main")["object"]["sha"]}
    for p in gh.paged("/pulls?state=open&base=main", max_pages=3):
        if p.get("state") == "open" and p.get("head", {}).get("repo", {}).get(
                "full_name") == gh.repository:
            heads[p["head"]["ref"]] = p["head"]["sha"]
    return heads


def classify_current(runs, heads):
    """Most recent run per workflow, branch, and exact head SHA wins."""
    latest, historical = {}, []
    ordered = sorted(runs, key=lambda r: (r.get("created_at", ""), r.get("id", 0)),
                     reverse=True)
    for r in ordered:
        if heads.get(r.get("head_branch")) != r.get("head_sha"):
            if r.get("conclusion") in ("failure", "timed_out", "startup_failure"):
                historical.append(r)
            continue
        key = (r.get("workflow_id") or r.get("name"), r.get("head_branch"),
               r.get("head_sha"))
        if key not in latest:
            latest[key] = r
    actionable = [r for r in latest.values()
                  if r.get("status") == "completed" and
                  r.get("conclusion") in ("failure", "timed_out", "startup_failure")]
    return actionable, historical


def stackoverflow_research(rec):
    """Retrieve Stack Overflow links/titles only; no code execution."""
    query = ("github actions " + " ".join(rec.get("failed_steps") or
                                          rec.get("failed_jobs") or [])).strip()[:160]
    params = urllib.parse.urlencode({
        "site": "stackoverflow", "q": query, "sort": "relevance",
        "order": "desc", "pagesize": 3,
    })
    req = urllib.request.Request(
        "https://api.stackexchange.com/2.3/search/advanced?" + params,
        headers={"User-Agent": "tetdinhmuiblog-auditor/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as result:
            items = json.load(result).get("items", [])
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as err:
        print("WARN AUDITOR-STACKOVERFLOW-UNAVAILABLE " + clean(err), file=sys.stderr)
        return []
    evidence = []
    for item in items:
        link = item.get("link", "")
        uri = urllib.parse.urlsplit(link)
        if uri.scheme != "https" or uri.netloc != "stackoverflow.com":
            continue
        evidence.append({
            "title": clean(html.unescape(item.get("title", "")), 130),
            "link": link, "score": int(item.get("score", 0)),
        })
    return evidence


def learned_knowledge(gh, rec, issues):
    urls = []
    for issue in issues:
        title = issue.get("title", "")
        if (title.startswith("[RESEARCHER]") or title.startswith("[CI INCIDENT]")) and (
                rec["fingerprint"] in title or
                rec["code"] in (issue.get("body") or "")):
            urls.append(issue["html_url"])
        if len(urls) >= 3:
            break
    return urls


def issue_text(run, rec, knowledge, evidence):
    lines = [
        ISSUE_MARKER,
        "## Failed workflow: " + rec["code"],
        "- Fingerprint: " + rec["fingerprint"],
        "- Run: " + rec["url"],
        "- Commit: " + rec["head_sha"],
        "- Branch: " + rec["target"],
        "- Failure stage: " + ", ".join(rec.get("failed_steps") or
                                       rec.get("failed_jobs") or ["unknown"]),
        "- Verified diagnostic guidance: " + rec["guidance"],
        "",
        "## Accumulated researcher knowledge",
    ]
    lines.extend("- " + u for u in knowledge)
    if not knowledge:
        lines.append("- No matching verified fix found.")
    lines.extend(["", "## Stack Overflow suggestions (UNVERIFIED)"])
    lines.extend("- [" + e["title"] + "](" + e["link"] + ") score=" +
                 str(e["score"]) for e in evidence)
    if not evidence:
        lines.append("- No external search results available.")
    lines.extend([
        "", "## Automatic recovery policy",
        "- Retry only identified runner startup failures, up to four reruns.",
        "- Dispatch an existing lockfile recovery workflow only when its fingerprint matches.",
        "- All other cases: STOP, investigate root cause, propose exactly one fix PR.",
        "- No blind code execution from Stack Overflow, no force-merge or disabled CI.",
        "- Historical red runs cannot become green retroactively.",
    ])
    return "\n".join(lines)


def issue_for_run(issues, run_id):
    needle = "run:" + str(run_id)
    return next((x for x in issues if x.get("title", "").startswith("[AUDITOR]") and
                 x["title"].endswith(needle) and "pull_request" not in x), None)


def is_retriable(run, rec):
    return (rec["code"] == "CI-RUNNER-STARTUP" and
            int(run.get("run_attempt") or 1) < MAX_ATTEMPTS)


def request_retry_once(gh, run, issue):
    attempt = int(run.get("run_attempt") or 1)
    marker = "<!-- auditor-retry-attempt:" + str(attempt) + " -->"
    comments = gh.paged("/issues/" + str(issue["number"]) + "/comments", max_pages=3)
    if any(marker in x.get("body", "") for x in comments):
        print("INFO AUDITOR-RETRY-ALREADY-REQUESTED " + str(run["id"]))
        return
    gh.call("POST", "/issues/" + str(issue["number"]) + "/comments", {
        "body": marker + "\nRequesting failed-job rerun (attempt " +
                str(attempt + 1) + " of maximum " + str(MAX_ATTEMPTS) + ").",
    })
    gh.call("POST", "/actions/runs/" + str(run["id"]) + "/rerun-failed-jobs", {})
    print("NOTICE AUDITOR-RETRY run=" + str(run["id"]) +
          " attempt=" + str(attempt + 1))


def diagnose(gh, run, issues):
    jobs = gh.call("GET", "/actions/runs/" + str(run["id"]) +
                   "/jobs?per_page=100").get("jobs", [])
    rec = classify_ci(run, jobs)
    if rec is None:
        return None
    existing = issue_for_run(issues, run["id"])
    created = not bool(existing)
    if created:
        knowledge = learned_knowledge(gh, rec, issues)
        evidence = stackoverflow_research(rec)
        issue = gh.call("POST", "/issues", {
            "title": "[AUDITOR] " + rec["code"] + " run:" + str(run["id"]),
            "body": issue_text(run, rec, knowledge, evidence),
        })
        print("NOTICE AUDITOR-INCIDENT " + issue["html_url"])
    else:
        issue = existing

    status = "SMART_STOP — actionable investigation required"
    if is_retriable(run, rec):
        request_retry_once(gh, run, issue)
        status = "SMART_RETRY — runner startup"
    elif rec["code"] == "CI-INSTALL-FAILED" and created and (
            run.get("name") == "CI · Quality Gate" and
            run.get("event") == "push" and run.get("head_branch") == "main"):
        gh.call("POST", "/actions/workflows/self-healing.yml/dispatches", {
            "ref": "main", "inputs": {"incident_run_id": str(run["id"])},
        })
        status = "KNOWN_RECIPE_DISPATCHED — main-only lockfile recovery"

    return {"code": rec["code"], "run": run["id"],
            "issue": issue["html_url"], "outcome": status}


def scan_once(gh):
    runs = gh.call("GET", "/actions/runs?per_page=100").get("workflow_runs", [])
    actionable, historical = classify_current(runs, active_heads(gh))
    results = []
    if actionable:
        issues = gh.paged("/issues?state=all", max_pages=4)
        for run in actionable:
            try:
                result = diagnose(gh, run, issues)
                if result:
                    results.append(result)
            except (RuntimeError, KeyError, ValueError) as err:
                print("ERROR AUDITOR-INCIDENT " + clean(err, 240), file=sys.stderr)
                results.append({"code": "AUDITOR-PROCESSING-ERROR", "run": run["id"],
                                "issue": "", "outcome": clean(err, 180)})
    return {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "checked": len(runs), "current_red": len(actionable),
        "historical_red": len(historical), "results": results,
    }


def write_report(scans, path="auditor.md"):
    lines = [
        "# Auditor — GitHub Actions health",
        "",
        "Checks are limited to the 100 most recent workflow runs per cycle.",
        "Historical red X marks are immutable and do not trigger repeated repairs.",
        "",
        "| UTC timestamp | Current failed | Historical red | Runs checked |",
        "|---|---:|---:|---:|",
    ]
    for scan in scans:
        lines.append("| " + scan["time"] + " | " + str(scan["current_red"]) +
                     " | " + str(scan["historical_red"]) + " | " +
                     str(scan["checked"]) + " |")
    lines += ["", "## Incident actions", ""]
    for scan in scans:
        for incident in scan["results"]:
            lines.append("- " + incident["code"] + " / run " +
                         str(incident["run"]) + " / " + incident["outcome"] +
                         (" / " + incident["issue"] if incident["issue"] else ""))
    if not any(s["results"] for s in scans):
        lines.append("No currently actionable failing runs in this scan window.")
    lines += [
        "", "## Safety",
        "- Maximum four retries for verified runner startup failure.",
        "- Known deterministic fixes get their own PR and must pass CI.",
        "- Third-party Stack Overflow suggestions are never executed automatically.",
        "- Old failed runs remain visible as immutable GitHub history.",
    ]
    with open(path, "w", encoding="utf-8") as stream:
        stream.write("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cycles", type=int, choices=range(1, 6), default=1)
    parser.add_argument("--interval", type=int, default=60)
    args = parser.parse_args()
    if args.interval < 60:
        parser.error("Minimum audit spacing is 60 seconds")
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    if not token or not repo:
        print("ERROR AUDITOR-AUTH-MISSING", file=sys.stderr)
        return 2
    gh = GitHub(token, repo)
    scans = []
    for index in range(args.cycles):
        try:
            scan = scan_once(gh)
            scans.append(scan)
            print("NOTICE AUDITOR-CYCLE " + str(index + 1) + "/" +
                  str(args.cycles) + " current_red=" + str(scan["current_red"]) +
                  " historical_red=" + str(scan["historical_red"]), flush=True)
        except (RuntimeError, ValueError, KeyError, OSError) as err:
            print("ERROR AUDITOR-SCAN " + clean(err, 240), file=sys.stderr)
            write_report(scans)
            return 1
        write_report(scans)
        if index + 1 < args.cycles:
            time.sleep(args.interval)
    return 0


if __name__ == "__main__":
    sys.exit(main())

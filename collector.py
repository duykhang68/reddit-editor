#!/usr/bin/env python3
"""GitHub auto-merge evidence collector; standard library only.

Renders collector.md and maintains data/collector-events.json. A PR is marked
AUTO_MERGED only if a dispatch from the merge workflow recorded its exact head.
Other historical merges remain UNVERIFIED rather than being misclassified.
"""
import argparse
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
EVENTS = ROOT / "data" / "collector-events.json"
REPORT = ROOT / "collector.md"
REPO = os.getenv("GITHUB_REPOSITORY", "duykhang68/tetdinhmuiblog")
API = "https://api.github.com"
TOKEN = os.getenv("GITHUB_TOKEN", "")
REQUIRED = "Test and build (Node 22)"


def api(path):
    request = Request(API + path, headers={
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "auto-merge-evidence-collector",
        **({"Authorization": "Bearer " + TOKEN} if TOKEN else {}),
    })
    try:
        with urlopen(request, timeout=25) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError("GitHub API HTTP %s for %s" % (exc.code, path)) from exc


def safe(value):
    return str(value or "").replace("|", "\\|").replace("\n", " ").replace("\r", " ").replace("<", "&lt;").replace(">", "&gt;")[:170]


def load_events():
    if not EVENTS.exists():
        return []
    obj = json.loads(EVENTS.read_text(encoding="utf-8"))
    return obj if isinstance(obj, list) else []


def merged_prs():
    prs = []
    for page in range(1, 4):  # bounded to 300 latest PRs
        chunk = api("/repos/%s/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=%s" % (REPO, page))
        prs.extend(pr for pr in chunk if pr.get("merged_at"))
        if len(chunk) < 100:
            break
    return prs


def record_event(events, number, sha, run_id):
    if not number or not sha or not run_id:
        return events, False
    pr = api("/repos/%s/pulls/%d" % (REPO, number))
    if not pr.get("merged") or pr["head"]["sha"] != sha:
        raise RuntimeError("PR merge status or tested head SHA mismatch; refusing evidence")
    run = api("/repos/%s/actions/runs/%s" % (REPO, run_id))
    if run.get("name") != "Auto Approve and Merge · CI Green":
        raise RuntimeError("Run is not the configured auto-merge workflow")
    # Only collect provenance after real merge; the dispatch itself is the
    # automation signal, never infer from PR author or the merge timestamp.
    if any(ev.get("pr") == number and ev.get("head_sha") == sha for ev in events):
        return events, False
    runs = api("/repos/%s/commits/%s/check-runs?per_page=100" % (REPO, quote(sha, safe="")))
    green = any(c.get("name") == REQUIRED and c.get("status") == "completed"
                and c.get("conclusion") == "success" and c.get("head_sha") == sha
                for c in runs.get("check_runs", []))
    if not green:
        raise RuntimeError("Required CI is not verified green on recorded SHA")
    files = api("/repos/%s/pulls/%s/files?per_page=100" % (REPO, number))
    workflow_change = any(f["filename"].startswith((".github/workflows/", ".github/actions/"))
                          or f["filename"] in ("CODEOWNERS", ".github/CODEOWNERS")
                          for f in files)
    event = {
        "pr": number, "head_sha": sha, "merge_sha": pr.get("merge_commit_sha"),
        "merged_at": pr.get("merged_at"), "run_id": int(run_id),
        "ci": "success", "workflow_change": workflow_change,
    }
    return (events + [event]), True


def bar(value, total, width=18):
    n = round(width * value / total) if total else 0
    return "█" * n + "░" * (width - n)


def report(prs, events):
    by_pr = {e["pr"]: e for e in events}
    recognized = [p for p in prs if p["number"] in by_pr and
                  by_pr[p["number"]]["head_sha"] == p["head"]["sha"]]
    unknown = len(prs) - len(recognized)
    workflows = sum(bool(by_pr[p["number"]]["workflow_change"]) for p in recognized)
    ordinary = len(recognized) - workflows
    total = len(prs)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Auto-Merge Collector · Evidence & Smart Insights", "",
        "> Dữ liệu GitHub API; chỉ đánh dấu **AUTO-MERGED (verified)** khi collector",
        "> nhận tín hiệu từ workflow auto-merge và xác thực PR, SHA cùng CI xanh.",
        "> Các PR lịch sử không có bằng chứng được ghi **chưa xác minh nguồn merge**,",
        "> không tự suy đoán là merge thủ công hay tự động.", "",
        "Cập nhật: **%s** · Repository: `%s`" % (now, REPO), "",
        "## 📊 Dashboard", "",
        "| Chỉ số | Giá trị |",
        "|---|---:|",
        "| PR đã merge (tối đa 300 PR gần đây) | %d |" % total,
        "| AUTO-MERGED có bằng chứng | %d |" % len(recognized),
        "| Auto-merge PR thường | %d |" % ordinary,
        "| Auto-merge PR thay đổi workflow | %d |" % workflows,
        "| Nguồn merge chưa xác minh | %d |" % unknown,
        "",
        "### Phân bố bằng chứng", "",
        "```mermaid",
        "pie showData",
        '    "Auto-merge verified" : %d' % len(recognized),
        '    "Chưa xác minh" : %d' % unknown,
        "```", "",
        "`Auto-merge ` %s **%d/%d**" % (bar(len(recognized), total), len(recognized), total),
        "", "## ✅ Vì sao từng PR được auto-merge?", "",
        "| PR | Thời điểm UTC | Loại | CI HEAD | Bằng chứng & lý do |",
        "|---|---|---|---|---|",
    ]
    for p in sorted(recognized, key=lambda p: p["merged_at"] or "", reverse=True)[:75]:
        ev = by_pr[p["number"]]
        kind = "Workflow/config" if ev["workflow_change"] else "Code/docs"
        reason = ("CI green trên HEAD `%s`; GitHub chấp nhận merge; "
                  "[Run #%s](https://github.com/%s/actions/runs/%s)" %
                  (ev["head_sha"][:8], ev["run_id"], REPO, ev["run_id"]))
        lines.append("| [#%d](%s) %s | %s | %s | ✅ | %s |" % (
            p["number"], p["html_url"], safe(p["title"])[:55],
            safe(ev["merged_at"]), kind, reason))
    if not recognized:
        lines.append("| — | — | — | — | Chưa có sự kiện auto-merge được ghi nhận |")
    lines += ["", "## 🧠 Smart Insights", ""]
    if recognized:
        share = 100 * workflows / len(recognized)
        lines += [
            "- **Tỷ lệ workflow trong các auto-merge đã xác minh:** %.1f%% (%d/%d)." %
              (share, workflows, len(recognized)),
            "- **Quality gate:** %d auto-merge có bằng chứng CI thành công trên SHA chính xác." % len(recognized),
            "- **Bài học:** Kiểm tra SHA hiện tại giúp tránh dùng kết quả CI của commit cũ.",
            "- **Bài học:** PR thay đổi GitHub Actions cần credential đủ quyền `Workflows: write`; CI xanh không tự cấp quyền.",
            "- **Bài học:** Branch protection và khả năng merge do GitHub thực thi; collector chỉ phản ánh kết quả đã xảy ra.",
        ]
    else:
        lines += [
            "- Chưa đủ dữ liệu có nguồn gốc để rút ra tỷ lệ auto-merge đáng tin cậy.",
            "- Bài học vận hành: lưu dấu vết từ chính workflow tại thời điểm merge; không suy luận từ nhãn PR.",
        ]
    if unknown:
        lines.append("- **Khoảng trống dữ liệu:** %d PR đã merge chưa có bằng chứng collector; không tính là auto-merge." % unknown)
    lines += [
        "", "## 🛡️ Giới hạn và phương pháp", "",
        "- Chỉ tính những PR đã merge trong tối đa 300 PR đóng gần đây; dữ liệu tổng hợp không phải toàn bộ lịch sử.",
        "- Collector ghi nhận sự kiện do workflow gửi, xác thực tên run, PR merged, exact SHA và CI check thành công.",
        "- Trạng thái không conflict / branch rules được GitHub thực thi lúc merge thành công; không lưu ảnh chụp ruleset lịch sử.",
        "- CI xanh là điều kiện cần, không phải bảo đảm thay đổi không có lỗi. Insights là quy tắc phân tích, không phải nhận định AI sinh tự động.",
        "- Tệp sự kiện: `data/collector-events.json`; script tạo báo cáo: `collector.py`.",
        "",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pr", type=int)
    parser.add_argument("--sha")
    parser.add_argument("--run-id", type=int)
    args = parser.parse_args()
    events = load_events()
    if args.pr or args.sha or args.run_id:
        if not all((args.pr, args.sha, args.run_id)):
            parser.error("--pr, --sha, --run-id are required together")
        events, _ = record_event(events, args.pr, args.sha, args.run_id)
    prs = merged_prs()
    EVENTS.parent.mkdir(parents=True, exist_ok=True)
    EVENTS.write_text(json.dumps(events, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    REPORT.write_text(report(prs, events), encoding="utf-8")
    print("COLLECTOR_OK: %s verified events, %s merged PRs sampled" % (len(events), len(prs)))


if __name__ == "__main__":
    main()

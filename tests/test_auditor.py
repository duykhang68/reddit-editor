"""Offline tests for the minute-interval GitHub CI auditor."""
import tempfile
import unittest
from pathlib import Path

import auditor


def run(id, sha="a" * 40, branch="main", conclusion="failure",
        workflow_id=1, date="2026-11-06T00:00:00Z", status="completed"):
    return {
        "id": id, "workflow_id": workflow_id, "name": "CI · Quality Gate",
        "head_branch": branch, "head_sha": sha,
        "conclusion": conclusion, "status": status, "created_at": date,
        "run_attempt": 1,
    }


class AuditorTests(unittest.TestCase):
    def test_only_current_head_failures_are_actionable(self):
        active, history = auditor.classify_current(
            [run(1, sha="oldsha"), run(2, sha="a" * 40)],
            {"main": "a" * 40},
        )
        self.assertEqual([x["id"] for x in active], [2])
        self.assertEqual([x["id"] for x in history], [1])

    def test_newer_success_supersedes_older_red_on_same_sha(self):
        active, historical = auditor.classify_current(
            [run(1, date="2026-11-06T00:00:00Z"),
             run(2, conclusion="success", date="2026-11-06T01:00:00Z")],
            {"main": "a" * 40},
        )
        self.assertEqual(active, [])
        self.assertEqual(historical, [])

    def test_unfinished_new_run_does_not_repair_older_failed_run(self):
        active, _ = auditor.classify_current(
            [run(1, date="2026-11-06T00:00:00Z"),
             run(2, status="in_progress", conclusion=None,
                 date="2026-11-06T01:00:00Z")],
            {"main": "a" * 40},
        )
        self.assertFalse(active)

    def test_retry_never_exceeds_four_reruns(self):
        record = {"code": "CI-RUNNER-STARTUP"}
        self.assertTrue(auditor.is_retriable({"run_attempt": 1}, record))
        self.assertTrue(auditor.is_retriable({"run_attempt": 4}, record))
        self.assertFalse(auditor.is_retriable({"run_attempt": 5}, record))
        self.assertFalse(auditor.is_retriable(
            {"run_attempt": 1}, {"code": "CI-BUILD-FAILED"}
        ))

    def test_issue_lookup_requires_exact_run_number(self):
        issues = [
            {"title": "[AUDITOR] CI-UNKNOWN run:100", "number": 2},
            {"title": "[AUDITOR] CI-UNKNOWN run:10", "number": 3},
        ]
        self.assertEqual(auditor.issue_for_run(issues, 10)["number"], 3)
        self.assertIsNone(auditor.issue_for_run(issues, 1))

    def test_markdown_contains_actionable_results(self):
        scans = [{
            "time": "2026-11-06T00:00:00Z",
            "checked": 100, "current_red": 1, "historical_red": 5,
            "results": [{
                "code": "CI-BUILD-FAILED", "run": 33,
                "issue": "https://github.com/test/test/issues/2",
                "outcome": "SMART_STOP",
            }],
        }]
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / "auditor.md")
            auditor.write_report(scans, path=path)
            data = Path(path).read_text()
            self.assertIn("CI-BUILD-FAILED", data)
            self.assertIn("Historical red", data)
            self.assertIn("SMART_STOP", data)


if __name__ == "__main__":
    unittest.main()

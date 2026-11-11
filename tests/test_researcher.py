"""Offline regression tests for the incident researcher. No GitHub calls."""
import unittest
from unittest import mock

import researcher


class FingerprintingTests(unittest.TestCase):
    def test_fingerprint_is_stable_for_recurring_error(self):
        first = researcher.fingerprint("CI", "CI-BUILD-FAILED|Production frontend build")
        second = researcher.fingerprint("CI", "CI-BUILD-FAILED|Production frontend build")
        self.assertEqual(first, second)
        self.assertNotEqual(first, researcher.fingerprint("CI", "Other error"))

    def test_build_failure_classification(self):
        run = {
            "id": 100, "name": "CI · Quality Gate", "conclusion": "failure",
            "head_sha": "a" * 40, "head_branch": "feature",
            "html_url": "https://github.com/test/repo/actions/runs/100",
        }
        jobs = [{"name": "Test and build (Node 22)", "conclusion": "failure",
                 "steps": [{"name": "Production frontend build", "conclusion": "failure"}]}]
        result = researcher.classify_ci(run, jobs)
        self.assertEqual(result["code"], "CI-BUILD-FAILED")
        self.assertIn("CI-BUILD-FAILED", result["signature"])

    def test_success_does_not_produce_incident(self):
        self.assertIsNone(researcher.classify_ci({"conclusion": "success"}, []))

    def test_startup_failure_has_bounded_retry_recipe(self):
        record = researcher.classify_ci(
            {"conclusion": "startup_failure", "name": "CI · Quality Gate"}, []
        )
        self.assertEqual(record["code"], "CI-RUNNER-STARTUP")
        self.assertEqual(researcher.MAX_RUN_ATTEMPTS, 5)

    def test_conflict_identity_is_based_on_paths_not_pr_number(self):
        files = [{"filename": ".github/workflows/pr-fix-version.yml"}]
        a = researcher.classify_conflict(
            {"number": 10, "head": {"sha": "a" * 40}, "html_url": "https://a"}, files
        )
        b = researcher.classify_conflict(
            {"number": 99, "head": {"sha": "b" * 40}, "html_url": "https://b"}, files
        )
        self.assertEqual(a["fingerprint"], b["fingerprint"])
        self.assertEqual(a["code"], "PR-MERGE-DIRTY")
        self.assertIn("permissions", a["guidance"])

    def test_markdown_sanitizes_embedded_markup_and_avoids_raw_logs(self):
        run = {
            "conclusion": "failure", "name": "CI · Quality Gate",
            "html_url": "https://example.invalid/1",
        }
        jobs = [{"name": "CI", "conclusion": "failure",
                 "steps": [{"name": "<script>danger</script>", "conclusion": "failure"}]}]
        md = researcher.markdown(researcher.classify_ci(run, jobs))
        self.assertNotIn("<script>", md)
        self.assertIn("Verification required", md)

    def test_repository_validation(self):
        with self.assertRaises(ValueError):
            researcher.GitHub("token", "other/path/with/more")


class TokenRoutingTests(unittest.TestCase):
    """Issue writes use GITHUB_TOKEN, knowledge PRs use a separate PAT."""

    def test_recurring_issue_comment_uses_issue_token_not_pr_token(self):
        record = {
            "fingerprint": "CI-EXAMPLE123", "code": "CI-CHECK-FAILED",
            "url": "https://github.com/test/repo/actions/runs/123",
        }

        class IssueGitHub:
            def __init__(self):
                self.calls = []

            def paged(self, path, max_pages=5):
                self.calls.append(("GET", path))
                return []

            def call(self, method, path, payload=None):
                self.calls.append((method, path))
                return {"id": 1}

        issue_gh = IssueGitHub()
        pr_gh = object()
        with mock.patch.object(researcher, "find_incident_issue", return_value={"number": 35}):
            new_issue = researcher.record_incident(issue_gh, record, pr_gh)
        self.assertFalse(new_issue)
        self.assertIn(("POST", "/issues/35/comments"), issue_gh.calls)

    def test_new_incident_uses_dedicated_pr_token(self):
        record = {
            "fingerprint": "CI-EXAMPLE123", "code": "CI-CHECK-FAILED",
            "kind": "CI", "signature": "test", "target": "main",
            "url": "https://github.com/test/repo/actions/runs/123",
            "guidance": "Investigate", "failed_steps": ["test step"],
            "failed_jobs": [],
        }

        class IssueGitHub:
            def call(self, method, path, payload=None):
                self.last_request = (method, path)
                return {"html_url": "https://github.com/test/repo/issues/35"}

        issue_gh = IssueGitHub()
        pr_gh = object()
        with (mock.patch.object(researcher, "find_incident_issue", return_value=None),
              mock.patch.object(researcher, "create_knowledge_pr") as create_pr):
            is_new = researcher.record_incident(issue_gh, record, pr_gh)
        self.assertTrue(is_new)
        self.assertEqual(issue_gh.last_request, ("POST", "/issues"))
        create_pr.assert_called_once_with(pr_gh, record)

    def test_missing_pr_token_preserves_incident_without_untested_pr(self):
        record = {
            "fingerprint": "CI-EXAMPLE123", "code": "CI-CHECK-FAILED",
            "kind": "CI", "signature": "test", "target": "main",
            "url": "https://github.com/test/repo/actions/runs/123",
            "guidance": "Investigate", "failed_steps": ["test step"],
            "failed_jobs": [],
        }

        class IssueGitHub:
            def __init__(self):
                self.paths = []

            def call(self, method, path, payload=None):
                self.paths.append(path)
                return {"html_url": "https://github.com/test/repo/issues/35"}

        issue_gh = IssueGitHub()
        with (mock.patch.object(researcher, "find_incident_issue", return_value=None),
              mock.patch.object(researcher, "create_knowledge_pr") as create_pr):
            is_new = researcher.record_incident(issue_gh, record)
        self.assertTrue(is_new)
        self.assertEqual(issue_gh.paths, ["/issues"])
        create_pr.assert_not_called()


if __name__ == "__main__":
    unittest.main()

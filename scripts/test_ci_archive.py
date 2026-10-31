import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).with_name("ci_archive.py").resolve()


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=os.environ.get("RUNNER_TEMP"))
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        (self.repo / "tracked.txt").write_text("fixture")
        self.git("add", "tracked.txt")
        self.git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture")
        self.commit = self.git("rev-parse", "HEAD").strip()
        (self.repo / ".env").write_text("fixture-secret-must-stay-out")
        self.runner_temp = self.root / "runner-temp"
        self.runner_temp.mkdir()
        for name in ["quota", "anon", "source-owner"]:
            (self.runner_temp / f"localley-{name}-proof-123-1.json").write_text(json.dumps({"proof": name}))
        (self.runner_temp / "localley-quota-proof-999-1.json").write_text("other run")
        self.store = self.root / "artifacts"
        self.env = {**os.environ, "GITHUB_REPOSITORY": "nkopp-cmd/travelchat-ai",
                    "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1", "GITHUB_SHA": self.commit,
                    "RUNNER_TEMP": str(self.runner_temp), "LOCALLEY_ARTIFACT_ROOT": str(self.store)}

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.repo, text=True)

    def run_archive(self, expected=0):
        result = subprocess.run(["python3", "-B", str(SCRIPT), "proof"], cwd=self.repo,
                                env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stderr)
        return json.loads(result.stdout) if expected == 0 else None

    def test_archive_is_run_bound_checksummed_and_lists_missing_reports(self):
        metadata = self.run_archive()
        path = Path(metadata["archive"])
        self.assertEqual(path.parent.name, f"123-1-{self.commit}")
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), metadata["sha256"])
        self.assertEqual(json.loads((path.parent / "proof.json").read_text())["sha256"], metadata["sha256"])
        with tarfile.open(path) as archive:
            self.assertEqual(sorted(archive.getnames()), ["localley-anon-proof-123-1.json",
                "localley-quota-proof-123-1.json", "localley-source-owner-proof-123-1.json"])
        self.assertEqual(metadata["missing"], ["localley-affiliate-policy-proof-123-1.json"])

    def test_wrong_repository_is_rejected(self):
        self.env["GITHUB_REPOSITORY"] = "someone/else"
        self.run_archive(expected=1)
        self.assertFalse(self.store.exists())

    def test_wrong_checked_out_commit_is_rejected(self):
        self.env["GITHUB_SHA"] = "0" * 40
        self.run_archive(expected=1)
        self.assertFalse(self.store.exists())

    def test_symlinked_report_is_skipped(self):
        secret = self.repo / ".env"
        target = self.runner_temp / "localley-affiliate-policy-proof-123-1.json"
        target.symlink_to(secret)
        metadata = self.run_archive()
        self.assertNotIn(target.name, metadata["inputs"])

    def test_oversize_archive_is_rejected_and_partial_removed(self):
        spec = importlib.util.spec_from_file_location("ci_archive", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.MAX_BYTES = 5
        with contextlib.chdir(self.repo), mock.patch.dict(os.environ, self.env):
            with self.assertRaisesRegex(ValueError, "32 MiB"):
                module.archive("proof")
        self.assertFalse(list(self.store.rglob("*.tgz*")))

    def test_retention_is_bounded_and_preserves_foreign_directories(self):
        self.store.mkdir()
        for run in range(25):
            directory = self.store / f"{run}-1-{self.commit}"
            directory.mkdir()
            (directory / "proof.json").write_text(json.dumps({"repository": "nkopp-cmd/travelchat-ai",
                "run_id": str(run), "run_attempt": "1", "commit": self.commit}))
        other_repo = self.store / f"900-1-{self.commit}"
        other_repo.mkdir()
        (other_repo / "release.json").write_text(json.dumps({"repository": "nkopp-cmd/livecourse",
            "run_id": "900", "run_attempt": "1", "commit": self.commit}))
        foreign = self.store / "foreign-evidence"
        foreign.mkdir()
        self.run_archive()
        self.assertTrue(foreign.exists())
        self.assertTrue(other_repo.exists())
        self.assertEqual(len([p for p in self.store.iterdir() if p not in (foreign, other_repo)]), 20)


if __name__ == "__main__":
    unittest.main()

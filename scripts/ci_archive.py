"""Keep bounded, checksum-bound CI proof reports on the ci-1 server (no GitHub artifact storage).

Pattern from apps/livecourse/scripts/ci_archive.py (advisor decision 2026-10-31: the Actions budget
is USD 0, so actions/upload-artifact fails). Archive path:
/home/dev/projects/CyberLink/codex-work/localley-artifacts/<run-id>-<attempt>-<commit>/proof.{tgz,json}
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile

REPOSITORY = "nkopp-cmd/travelchat-ai"
MAX_BYTES = 32 * 1024 * 1024
MAX_RUNS = 20
DEFAULT_ROOT = "/home/dev/projects/CyberLink/codex-work/localley-artifacts"
# Reports the D1 candidate proofs write to $RUNNER_TEMP (see .github/workflows/d1-preview-verification.yml).
PROOF_REPORTS = ["quota", "affiliate-policy", "anon", "source-owner"]


def phase_inputs(phase, run, attempt):
    if phase != "proof":
        raise ValueError(f"Unknown phase {phase}")
    temp = Path(os.environ["RUNNER_TEMP"])
    return [temp / f"localley-{name}-proof-{run}-{attempt}.json" for name in PROOF_REPORTS]


def archive(phase):
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    run, attempt = os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"]
    if (os.environ.get("GITHUB_REPOSITORY") != REPOSITORY
            or not re.fullmatch(r"[0-9]+", run) or not re.fullmatch(r"[0-9]+", attempt)
            or not re.fullmatch(r"[a-f0-9]{40}", commit)
            or os.environ.get("GITHUB_SHA") != commit):
        raise ValueError("CI repository, run or checked-out commit mismatch")
    candidates = phase_inputs(phase, run, attempt)
    paths = [p for p in candidates if p.is_file() and not p.is_symlink()]
    missing = [p.name for p in candidates if p not in paths]
    root = Path(os.environ.get("LOCALLEY_ARTIFACT_ROOT", DEFAULT_ROOT))
    if root.is_symlink():
        raise ValueError("Artifact root must not be a symlink")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination = root / f"{run}-{attempt}-{commit}"
    if destination.is_symlink():
        raise ValueError("Artifact directory must not be a symlink")
    destination.mkdir(exist_ok=True, mode=0o700)
    temporary = destination / f"{phase}.tgz.part"
    target = destination / f"{phase}.tgz"
    try:
        with tarfile.open(temporary, "w:gz") as output:
            for path in paths:
                output.add(path, arcname=path.name)
        if temporary.stat().st_size > MAX_BYTES:
            raise ValueError("Artifact exceeds 32 MiB compressed limit")
        with temporary.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    metadata = {"repository": REPOSITORY, "run_id": run, "run_attempt": attempt,
                "commit": commit, "phase": phase, "sha256": digest,
                "bytes": target.stat().st_size, "inputs": [p.name for p in paths], "missing": missing}
    (destination / f"{phase}.json").write_text(json.dumps(metadata, indent=2) + "\n")
    # Regenerable CI outputs only. Ignore unknown files and directories of other repositories.
    owned = []
    for directory in root.iterdir():
        if directory.is_symlink() or not directory.is_dir() or not re.fullmatch(r"[0-9]+-[0-9]+-[a-f0-9]{40}", directory.name):
            continue
        for manifest in directory.glob("*.json"):
            try:
                recorded = json.loads(manifest.read_text())
                identity = f"{recorded['run_id']}-{recorded['run_attempt']}-{recorded['commit']}"
                if recorded.get("repository") == REPOSITORY and identity == directory.name:
                    owned.append(directory)
                    break
            except (ValueError, KeyError):
                continue
    ordered = sorted(owned, key=lambda p: (p != destination, -p.stat().st_mtime))
    for old in ordered[MAX_RUNS:]:
        shutil.rmtree(old)
    print(json.dumps({"archive": str(target), **metadata}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=["proof"])
    archive(parser.parse_args().phase)

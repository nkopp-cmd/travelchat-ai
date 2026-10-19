#!/usr/bin/env python3
"""Read-only public HTML timing evidence. No cache purge, login or application writes.

Usage: python3 scripts/public-cache-proof.py /absolute/private/new-output-directory
Exit 1 means the cache/performance gate is unproved; raw failures stay in the sample.
Each request uses a fresh curl connection. These are lab samples, not field p75.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import statistics
import subprocess


ROUTES = ("/", "/spots", "/pricing")
ORIGIN = "https://www.localley.io"


def final_headers(raw):
    headers = {}
    # Ignore proxy CONNECT and interim HTTP responses. Preserve repeated headers.
    for line in raw.replace("\r\n", "\n").splitlines():
        if line.startswith("HTTP/"):
            headers = {}
        elif ":" in line:
            key, value = line.split(":", 1)
            headers.setdefault(key.lower(), []).append(value.strip())
    return headers


def summarize(rows, expected):
    complete = len(rows) == expected and all(
        r["curl_exit"] == 0 and r.get("status") == 200
        and isinstance(r.get("ttfb_ms"), (int, float))
        and math.isfinite(r["ttfb_ms"]) and r["ttfb_ms"] >= 0
        for r in rows
    )
    values = sorted(r["ttfb_ms"] for r in rows if r.get("ttfb_ms") is not None)
    edge = complete and all(
        r["headers"].get("cf-cache-status") == ["HIT"]
        and len(r["headers"].get("age", [])) == 1
        and r["headers"]["age"][0].isdigit()
        and "set-cookie" not in r["headers"]
        and "text/html" in ",".join(r["headers"].get("content-type", [])).lower()
        and not any(x in ",".join(r["headers"].get("cache-control", [])).lower()
                    for x in ("private", "no-store", "no-cache"))
        for r in rows
    )
    p75 = values[math.ceil(len(values) * .75) - 1] if complete else None
    return {
        "complete": complete, "edge_hit_and_age_proved": bool(edge),
        "samples": len(rows), "ttfb_ms": values,
        "median_ms": statistics.median(values) if complete else None,
        "sample_p75_ms": p75,
        "passed": bool(edge and max(values) <= 50 and p75 <= 200),
    }


def capture(url, stem):
    command = ["curl", "--silent", "--show-error", "--compressed",
               "--max-time", "5", "--max-filesize", "1048576",
               "--dump-header", str(stem.with_suffix(".headers")),
               "--output", str(stem.with_suffix(".body")),
               "--write-out", "%{json}", url]
    result = subprocess.run(command, capture_output=True, text=True, timeout=7)
    stem.with_suffix(".curl.json").write_text(result.stdout)
    stem.with_suffix(".stderr").write_text(result.stderr)
    try:
        metrics = json.loads(result.stdout)
    except json.JSONDecodeError:
        metrics = {}
    headers_path = stem.with_suffix(".headers")
    body = stem.with_suffix(".body")
    return {
        "curl_exit": result.returncode, "status": metrics.get("http_code"),
        "ttfb_ms": metrics["time_starttransfer"] * 1000
        if "time_starttransfer" in metrics else None,
        "headers": final_headers(headers_path.read_text()) if headers_path.exists() else {},
        "body_sha256": hashlib.sha256(body.read_bytes()).hexdigest() if body.exists() else None,
        "body_bytes": body.stat().st_size if body.exists() else None,
        "transport_bytes": metrics.get("size_download"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if not args.output.is_absolute():
        parser.error("output must be an absolute private path")
    os.umask(0o077)
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    evidence = {"started_utc": datetime.now(timezone.utc).isoformat(),
                "method": "1 warmup plus 7 fresh-connection samples; nearest-rank lab p75",
                "scope": "anonymous GET only; no private/RSC exclusion acceptance or content equivalence claim",
                "routes": {}}
    for route in ROUTES:
        name = route.strip("/") or "home"
        rows = []
        for i in range(8):
            try:
                row = capture(ORIGIN + route, args.output / f"{name}-{i}")
            except subprocess.TimeoutExpired:
                row = {"curl_exit": 124, "status": None, "ttfb_ms": None, "headers": {}}
            if i:
                rows.append(row)
        evidence["routes"][route] = {"summary": summarize(rows, 7), "rows": rows}
        # Save progress before starting the next route. Failed samples are never replaced.
        (args.output / "summary.json").write_text(json.dumps(evidence, indent=2) + "\n")
    for route, data in evidence["routes"].items():
        print(route, json.dumps(data["summary"]))
    return 0 if all(r["summary"]["passed"] for r in evidence["routes"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())

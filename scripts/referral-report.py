#!/usr/bin/env python3
"""Weekly launch report for Localley: visits per source and sign-ups (last 7 days).

Run on the agent host (cron, Monday). Visits come from the Analytics Engine dataset
written by app/api/events/referral (lib/referral-point.ts); sign-ups are one read-only
count on the production Better Auth D1. --push sends the text through
shared/scripts/notify.sh. No secret is logged.
"""

import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
NOTIFY = ROOT.parents[1] / "shared" / "scripts" / "notify.sh"
KEYS = Path.home() / "secrets" / "keys.env"
ACCOUNT = "664f242340bcec2f32daaeee15f58bde"
AUTH_DB = "73378d0e-7f2a-465a-8188-a67cb6d2a5c2"  # localley-auth (production)
DATASET = "localley_referrals"


def token():
    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        return os.environ["CLOUDFLARE_API_TOKEN"]
    values = dict(line.split("=", 1) for line in KEYS.read_text().splitlines()
                  if "=" in line and not line.lstrip().startswith("#"))
    return values["CLOUDFLARE_API_TOKEN"].strip().strip('"')


def call(path, data, auth, content_type=None):
    headers = {"Authorization": "Bearer " + auth}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/{path}",
                                     data=data.encode(), headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def visits(auth):
    sql = (f"SELECT index1 AS source, blob2 AS medium, SUM(_sample_interval) AS visits FROM {DATASET} "
           "WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY source, medium ORDER BY visits DESC LIMIT 25 FORMAT JSON")
    try:
        return call("analytics_engine/sql", sql, auth).get("data", [])
    except urllib.error.HTTPError as error:
        # Before the first data point some API versions answer 422 "unknown table".
        if error.code == 422 and b"unknown table" in error.read().lower():
            return []
        raise


def signups(auth):
    sql = "SELECT COUNT(*) AS n FROM \"user\" WHERE createdAt >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')"
    result = call(f"d1/database/{AUTH_DB}/query", json.dumps({"sql": sql}), auth, "application/json")
    return result["result"][0]["results"][0]["n"]


def report(rows, new_users):
    lines = ["Localley launch week (last 7 days)", f"Sign-ups: {new_users}.",
             "Visits per source:" if rows else "Visits per source: none recorded."]
    lines += [f"- {r['source'] or 'unknown'} ({r['medium'] or 'referer'}): {int(float(r['visits']))}" for r in rows]
    return "\n".join(lines)


def main():
    auth = token()
    text = report(visits(auth), signups(auth))
    print(text)
    if "--push" in sys.argv:
        subprocess.run([str(NOTIFY), "--title", "Localley weekly", text], check=True, timeout=60)


if __name__ == "__main__":
    main()

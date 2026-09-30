#!/usr/bin/env python3
"""Prove one mapped owner's imported history on the isolated preview Worker.

Requires a private source snapshot, a Cloudflare token, and the preview-only
auth outbox. Prints counts and statuses, never source IDs or session secrets.
The temporary preview auth identity is removed even when an assertion fails.
"""

import argparse
import base64
import collections
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid4


BASE = "https://localley-next-preview.nkopp.workers.dev"
SAFE_ID = re.compile(r"[A-Za-z0-9_-]{8,100}\Z")
SAFE_EMAIL = re.compile(r"[A-Za-z0-9_@.-]{8,150}\Z")
NODE_HTTP = """
let input = '';
for await (const chunk of process.stdin) input += chunk;
const args = JSON.parse(input);
const response = await fetch(args.url, {
  method: args.method || 'GET',
  headers: args.headers || {},
  body: args.body || undefined,
  redirect: 'manual',
});
const body = Buffer.from(await response.arrayBuffer()).toString('base64');
console.log(JSON.stringify({status: response.status, body,
  source: response.headers.get('x-localley-data-source'),
  cookies: response.headers.getSetCookie()}));
"""


def rows(snapshot, table):
    return [row for page in sorted(snapshot.glob(f"{table}-*.json"))
            for row in json.loads(page.read_text())]


def d1(query):
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "localley-auth-preview",
         "--remote", "--json", "--command", query],
        capture_output=True, text=True, env=os.environ, check=False,
    )
    if result.returncode:
        raise RuntimeError("Preview auth D1 query failed")
    parsed = json.loads(result.stdout)
    if len(parsed) != 1 or not parsed[0]["success"]:
        raise RuntimeError("Preview auth D1 query returned an error")
    return parsed[0]["results"]


def http(path, cookie="", method="GET", payload=None):
    headers = {"cookie": cookie} if cookie else {}
    body = None
    if payload is not None:
        headers.update({"content-type": "application/json", "origin": BASE})
        body = json.dumps(payload)
    result = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_HTTP],
        input=json.dumps({"url": BASE + path, "headers": headers,
                          "method": method, "body": body}),
        capture_output=True, text=True, check=False, timeout=30,
    )
    if result.returncode:
        raise RuntimeError("Preview HTTP request failed")
    parsed = json.loads(result.stdout)
    return parsed["status"], parsed, base64.b64decode(parsed["body"])


def sign_in(email, password):
    status, headers, _ = http("/api/auth/sign-in/email", method="POST",
                              payload={"email": email, "password": password})
    if status != 200:
        raise RuntimeError(f"Historical preview sign-in failed: HTTP {status}")
    return "; ".join(value.split(";", 1)[0] for value in headers["cookies"])


def main(snapshot, owner_report):
    if not os.environ.get("CLOUDFLARE_API_TOKEN"):
        raise RuntimeError("Cloudflare token is missing")
    trips = rows(snapshot, "itineraries")
    conversations = rows(snapshot, "conversations")
    messages = rows(snapshot, "messages")
    unclaimed = set(json.loads(owner_report.read_text())["private"]["unclaimedOwners"])
    owner, trip_count = collections.Counter(
        trip["clerk_user_id"] for trip in trips).most_common(1)[0]
    if not SAFE_ID.fullmatch(owner) or owner in unclaimed or trip_count < 2:
        raise RuntimeError("No suitable mapped historical owner")
    owner_trips = [trip for trip in trips if trip["clerk_user_id"] == owner]
    owner_conversations = [item for item in conversations if item["clerk_user_id"] == owner]
    owner_conversation_ids = {item["id"] for item in owner_conversations}
    owner_messages = [item for item in messages if item["conversation_id"] in owner_conversation_ids]
    if not owner_conversations or not owner_messages:
        raise RuntimeError("Selected owner lacks a chat journey")

    test = None
    inserted = False
    try:
        signup = subprocess.run(
            ["node", "scripts/auth/preview-test-user.mjs", "--name", "historical-proof"],
            capture_output=True, text=True, check=False,
        )
        if signup.returncode:
            raise RuntimeError("Preview test account creation failed")
        test = json.loads(signup.stdout)
        user_id, email, cookie = test["userId"], test["email"], test["cookie"]
        if not SAFE_ID.fullmatch(user_id) or not SAFE_EMAIL.fullmatch(email) or not cookie:
            raise RuntimeError("Invalid preview auth fixture")
        sign_in(email, test["password"])
        assert d1(f"SELECT count(*) AS n FROM \"user\" WHERE id='{owner}'")[0]["n"] == 0
        alternate_email = f"historical-{uuid4().hex}@preview.localley.test"
        d1(f"INSERT INTO \"user\" SELECT '{owner}',name,'{alternate_email}',"
           f"emailVerified,image,createdAt,updatedAt,firstName,lastName,bio "
           f"FROM \"user\" WHERE id='{user_id}'")
        inserted = True
        d1(f"UPDATE account SET userId='{owner}' WHERE userId='{user_id}'")
        d1(f"UPDATE account SET accountId='{owner}' WHERE userId='{owner}' "
           f"AND accountId='{user_id}' AND providerId='credential'")
        d1(f"UPDATE session SET userId='{owner}' WHERE userId='{user_id}'")
        d1(f"DELETE FROM \"user\" WHERE id='{user_id}'")
        linked = d1(f"SELECT accountId,providerId FROM account WHERE userId='{owner}'")
        assert len(linked) == 1 and linked[0] == {"accountId": owner, "providerId": "credential"}

        cookie = sign_in(alternate_email, test["password"])

        status, _, body = http("/api/auth/get-session", cookie)
        assert status == 200 and json.loads(body)["user"]["id"] == owner
        print("historical preview session: 200, exact mapped ID", flush=True)

        status, headers, body = http("/api/conversations?data_candidate=d1", cookie)
        assert status == 200 and headers["source"] == "d1-preview", status
        actual = json.loads(body)["conversations"]
        assert {item["id"] for item in actual} == owner_conversation_ids
        actual_messages = [message for item in actual for message in item["messages"]]
        assert {item["id"] for item in actual_messages} == {item["id"] for item in owner_messages}
        print(f"candidate conversations: 200, {len(actual)} conversations and "
              f"{len(actual_messages)} messages match source IDs", flush=True)

        first_conversation = owner_conversations[0]
        status, headers, body = http(
            "/api/conversations/messages?conversationId=" + first_conversation["id"]
            + "&data_candidate=d1", cookie)
        assert status == 200 and headers["source"] == "d1-preview", status
        assert {item["id"] for item in json.loads(body)["messages"]} == {
            item["id"] for item in owner_messages
            if item["conversation_id"] == first_conversation["id"]}
        print("candidate message detail: 200, exact source IDs", flush=True)

        first_trip = owner_trips[0]
        status, headers, body = http("/api/itineraries/" + first_trip["id"]
                                    + "?data_candidate=d1", cookie)
        assert status == 200 and headers["source"] == "d1-preview", status
        detail = json.loads(body)
        assert all(detail[field] == first_trip[field] for field in ("id", "title", "city"))
        print("candidate itinerary detail: 200, source ID, title and city match", flush=True)

        status, _, body = http("/itineraries?data_candidate=d1", cookie)
        assert status == 200 and all(trip["id"].encode() in body for trip in owner_trips), status
        print(f"candidate itinerary page: 200, all {len(owner_trips)} source IDs present", flush=True)

        unclaimed_trip = next(item for item in trips if item["clerk_user_id"] in unclaimed)
        status, _, _ = http("/api/itineraries/" + unclaimed_trip["id"]
                           + "?data_candidate=d1", cookie)
        assert status == 403, status
        print("unclaimed itinerary: 403", flush=True)
        status, _, _ = http("/api/conversations?data_candidate=d1")
        assert status == 401, status
        print("signed-out candidate conversations: 401", flush=True)
    finally:
        if test:
            user_id, email = test["userId"], test["email"]
            if inserted:
                d1(f"DELETE FROM \"user\" WHERE id='{owner}'")
            d1(f"DELETE FROM \"user\" WHERE id='{user_id}'")
            d1(f"DELETE FROM auth_mail_outbox WHERE email='{email}'")
            remaining = d1(
                f"SELECT (SELECT count(*) FROM \"user\" WHERE id IN ('{owner}','{user_id}')) AS users, "
                f"(SELECT count(*) FROM session WHERE userId IN ('{owner}','{user_id}')) AS sessions, "
                f"(SELECT count(*) FROM account WHERE userId IN ('{owner}','{user_id}')) AS accounts, "
                f"(SELECT count(*) FROM auth_mail_outbox WHERE email='{email}') AS mail")
            assert all(value == 0 for value in remaining[0].values())
            print("preview auth cleanup: zero user, session, account and mail rows", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--owner-report", type=Path, required=True)
    args = parser.parse_args()
    try:
        main(args.snapshot, args.owner_report)
    except (AssertionError, RuntimeError, KeyError, IndexError, ValueError) as error:
        detail = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print(f"historical parity proof failed: {detail}", file=sys.stderr)
        sys.exit(1)

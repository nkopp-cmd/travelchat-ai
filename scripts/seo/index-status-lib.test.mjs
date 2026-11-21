import { test } from "node:test";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { DEFAULT_PATHS, MAX_URLS, indexNote, isIndexed, parseInspection, serviceAccountJwt, summarizeRows } from "./index-status-lib.mjs";

test("default list stays inside the 20 URL cap and has no duplicates", () => {
  assert.ok(DEFAULT_PATHS.length >= 15 && DEFAULT_PATHS.length <= MAX_URLS);
  assert.equal(new Set(DEFAULT_PATHS).size, DEFAULT_PATHS.length);
  assert.ok(DEFAULT_PATHS.includes("/pricing"));
});

test("isIndexed accepts only Google's indexed states", () => {
  assert.equal(isIndexed("Submitted and indexed"), true);
  assert.equal(isIndexed("Indexed, not submitted in sitemap"), true);
  for (const s of ["Crawled - currently not indexed", "Discovered - currently not indexed", "URL is unknown to Google", null, undefined])
    assert.equal(isIndexed(s), false);
});

test("parseInspection reads the index status and shortens the canonical", () => {
  const body = { inspectionResult: { indexStatusResult: {
    coverageState: "Submitted and indexed", verdict: "PASS", lastCrawlTime: "2026-11-19T04:00:00Z",
    googleCanonical: "https://www.localley.io/blog/paying-in-seoul" } } };
  assert.deepEqual(parseInspection("/blog/paying-in-seoul", body), {
    path: "/blog/paying-in-seoul", coverage: "Submitted and indexed", verdict: "PASS", indexed: true,
    lastCrawl: "2026-11-19T04:00:00Z", googleCanonical: "/blog/paying-in-seoul" });
  assert.equal(parseInspection("/", { inspectionResult: { indexStatusResult: { googleCanonical: "https://www.localley.io" } } }).googleCanonical, "/");
  assert.deepEqual(parseInspection("/x", {}), { path: "/x", coverage: null, verdict: null, indexed: false, lastCrawl: null, googleCanonical: null });
});

test("summarizeRows counts indexed over checked and keeps errors apart", () => {
  const rows = [{ path: "/", indexed: true }, { path: "/a", indexed: false }, { path: "/b", error: "HTTP 429" }];
  assert.deepEqual(summarizeRows(rows, "2026-11-23T06:40:00Z"),
    { at: "2026-11-23T06:40:00Z", indexed: 1, checked: 2, errors: 1, line: "indexed 1/2" });
});

test("indexNote says unknown, fresh or stale", () => {
  const now = Date.parse("2026-11-23T07:00:00Z");
  assert.match(indexNote(null, now), /unknown/);
  const state = { summary: { at: "2026-11-23T06:40:00Z", line: "indexed 12/20" } };
  assert.equal(indexNote(state, now), "google index of money/entry pages: indexed 12/20 (URL Inspection 2026-11-23)");
  assert.match(indexNote(state, now + 15 * 86_400_000), /, stale\)$/);
});

test("serviceAccountJwt is a valid RS256 token for the key", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = { client_email: "probe@example.iam.gserviceaccount.com", token_uri: "https://oauth2.googleapis.com/token",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
  const [h, p, sig] = serviceAccountJwt(key, "scope-x", 1000).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url")), { iss: key.client_email, scope: "scope-x", aud: key.token_uri, iat: 1000, exp: 4600 });
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, "base64url")));
});

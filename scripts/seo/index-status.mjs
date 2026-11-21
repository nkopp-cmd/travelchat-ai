#!/usr/bin/env node
// Push CC3: read-only Google URL Inspection of the money and entry pages (max 20 URLs).
// Key: ~/secrets/gsc-service-account.json (read-only webmasters scope; never printed).
// Writes the rows to claude-work/localley-index-status.json; scripts/business-metrics.mjs reads its summary.
//   node scripts/seo/index-status.mjs [--out FILE] [path ...]
// Cron (agent host): weekly, Monday 06:40 UTC.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_PATHS, MAX_URLS, PROPERTY, SITE, parseInspection, serviceAccountJwt, summarizeRows } from "./index-status-lib.mjs";

export const STATE_FILE = join(homedir(), "projects/CyberLink/claude-work/localley-index-status.json");
const KEY_FILE = process.env.GSC_KEY_FILE || join(homedir(), "secrets/gsc-service-account.json");
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

async function accessToken() {
  const key = JSON.parse(readFileSync(KEY_FILE, "utf8"));
  const res = await fetch(key.token_uri, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAccountJwt(key, SCOPE) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`token HTTP ${res.status}`);
  return body.access_token;
}

async function inspect(token, path) {
  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ inspectionUrl: SITE + path, siteUrl: PROPERTY }),
  });
  if (!res.ok) return { path, error: `HTTP ${res.status}` };
  return parseInspection(path, await res.json());
}

async function main() {
  const args = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args.splice(outAt, 2)[1] : STATE_FILE;
  const paths = (args.length ? args : DEFAULT_PATHS).slice(0, MAX_URLS);
  const token = await accessToken();
  const rows = [];
  for (const path of paths) rows.push(await inspect(token, path)); // one at a time: quota is per minute too
  const summary = summarizeRows(rows, new Date().toISOString());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ summary, rows }, null, 1)}\n`);
  for (const r of rows) console.log(`${r.path} | ${r.error ?? `${r.coverage} | crawled ${r.lastCrawl ?? "-"}`}`);
  console.log(`${summary.line}${summary.errors ? ` (${summary.errors} errors)` : ""}`);
  if (summary.checked === 0) process.exit(1);
}

main().catch((error) => { process.stderr.write(`index-status: ${error.message}\n`); process.exit(1); });

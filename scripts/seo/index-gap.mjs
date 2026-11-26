#!/usr/bin/env node
// Push DK1: index gap per page type. Read-only (webmasters.readonly key, never printed).
//  1. Search Console sitemaps (index + each child file): submitted vs indexed, last read.
//  2. URL Inspection on up to N URLs per page type, sampled evenly from the live sitemaps.
//  3. Search Analytics impressions/clicks per page type (last 28 days).
// Prints a Markdown table; writes the rows as JSON (default claude-work/localley-index-gap.json).
//   node scripts/seo/index-gap.mjs [--per-type 30] [--out FILE]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { PROPERTY, SITE, gapMarkdown, gapTable, pageType, parseInspection, samplePerType, searchByType, serviceAccountJwt } from "./index-status-lib.mjs";

const KEY_FILE = process.env.GSC_KEY_FILE || join(homedir(), "secrets/gsc-service-account.json");
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const WM = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(PROPERTY)}`;
const MAX_INSPECT = 200; // URL Inspection quota: 2000/day, 600/min per property

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

async function api(token, url, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000),
  });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim().replace(/&amp;/g, "&"));

async function liveSitemaps() {
  const index = await (await fetch(`${SITE}/sitemap.xml`)).text();
  const files = locs(index);
  const byFile = {};
  for (const f of files) byFile[f] = locs(await (await fetch(f)).text()).map((u) => u.replace(SITE, "") || "/");
  return byFile;
}

function sitemapRow(s) {
  const web = (s.contents ?? []).find((c) => c.type === "web") ?? {};
  return { path: s.path, lastDownloaded: s.lastDownloaded ?? null, submitted: Number(web.submitted) || 0, indexed: Number(web.indexed) || 0, errors: Number(s.errors) || 0, warnings: Number(s.warnings) || 0, pending: !!s.isPending };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const perType = Math.max(1, Number(opt("--per-type", 30)));
  const out = opt("--out", join(homedir(), "projects/CyberLink/claude-work/localley-index-gap.json"));
  const token = await accessToken();

  // 1. Sitemaps as Google sees them (index and its children).
  const top = await api(token, `${WM}/sitemaps`);
  const gsc = [];
  for (const s of top.json.sitemap ?? []) {
    gsc.push(sitemapRow(s));
    if (s.isSitemapsIndex) {
      const kids = await api(token, `${WM}/sitemaps?sitemapIndex=${encodeURIComponent(s.path)}`);
      for (const k of kids.json.sitemap ?? []) gsc.push(sitemapRow(k));
    }
  }

  // 2. Live sitemap paths -> per-type counts and samples -> URL Inspection.
  const byFile = await liveSitemaps();
  const all = Object.values(byFile).flat();
  const totals = {};
  for (const p of all) totals[pageType(p)] = (totals[pageType(p)] ?? 0) + 1;
  const samples = samplePerType(all, perType);
  const rows = [];
  for (const [type, paths] of Object.entries(samples)) {
    for (const path of paths) {
      if (rows.length >= MAX_INSPECT) break;
      const r = await api(token, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", { inspectionUrl: SITE + path, siteUrl: PROPERTY });
      rows.push({ type, ...(r.ok ? parseInspection(path, r.json) : { path, error: `HTTP ${r.status}` }) });
    }
  }

  // 3. Search Analytics per page, last 28 full days.
  const end = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const start = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const sa = await api(token, `${WM}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: ["page"], rowLimit: 25000 });
  const search = searchByType(sa.json.rows);

  const table = gapTable(rows, totals, search);
  const at = new Date().toISOString();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ at, perType, sitemaps: gsc, liveFiles: Object.fromEntries(Object.entries(byFile).map(([f, p]) => [f, p.length])), searchWindow: [start, end], searchOk: sa.ok, table, rows }, null, 1)}\n`);

  console.log(`index gap ${at.slice(0, 16)}Z (URL Inspection up to ${perType}/type; search ${start}..${end}${sa.ok ? "" : ` HTTP ${sa.status}`})`);
  console.log("\n| sitemap file (Google) | last read | submitted | indexed | errors | warnings |\n|---|---|---|---|---|---|");
  for (const s of gsc) console.log(`| ${s.path.replace(SITE, "")} | ${s.lastDownloaded?.slice(0, 10) ?? "-"} | ${s.submitted} | ${s.indexed} | ${s.errors} | ${s.warnings} |`);
  console.log(`\n${gapMarkdown(table)}`);
  const errs = rows.filter((r) => r.error).length;
  if (errs) console.log(`\n${errs} inspection errors`);
  if (!rows.length || errs === rows.length) process.exit(1);
}

main().catch((error) => { process.stderr.write(`index-gap: ${error.message}\n`); process.exit(1); });

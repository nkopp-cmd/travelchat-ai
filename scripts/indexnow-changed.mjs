// Push BF4: after each release, send IndexNow only the sitemap URLs that are new or have a changed <lastmod>.
//   node scripts/indexnow-changed.mjs            fetch sitemaps, diff against the last sent list, POST, save state
//   node scripts/indexnow-changed.mjs --dry-run  print the count, send nothing, save nothing
// The release deploy stage calls runIndexNow() after promote; it never throws, so IndexNow can never fail a release.
// State: one JSON file { date, entries: { loc: lastmod } } at LOCALLEY_INDEXNOW_STATE (default below, absolute
// because lane steps run with an empty HOME). No state yet = baseline only (the advisor sent all 1,706 URLs on
// 2026-11-20), so the first run sends nothing. Max 1 POST per run, max 10,000 URLs (IndexNow limit).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOST, ping } from "./weekly-post-publish.mjs";

export const SITEMAPS = ["/sitemaps/pages.xml", "/sitemaps/guides.xml", "/sitemaps/spots-1.xml"];
export const STATE_FILE = process.env.LOCALLEY_INDEXNOW_STATE ?? "/home/dev/.local/state/cyberlink/localley-indexnow.json";
export const MAX_URLS = 10_000;

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** { loc: lastmod } for every <url> of one sitemap; a missing <lastmod> is "". */
export function parseSitemap(xml) {
  const entries = {};
  for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(body)?.[1];
    if (!loc) continue;
    entries[decode(loc)] = decode(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(body)?.[1] ?? "");
  }
  return entries;
}

/** URLs that are new, or whose lastmod changed; unchanged and removed URLs are not sent. Only our host. */
export function changedUrls(previous, current) {
  return Object.keys(current)
    .filter((loc) => new URL(loc).host === HOST)
    .filter((loc) => !(loc in previous) || previous[loc] !== current[loc])
    .slice(0, MAX_URLS);
}

export async function fetchSitemaps(get = (url) => fetch(url)) {
  const entries = {};
  for (const p of SITEMAPS) {
    const response = await get(`https://${HOST}${p}`);
    if (response.status !== 200) throw new Error(`${p}: HTTP ${response.status}`);
    const parsed = parseSitemap(await response.text());
    if (!Object.keys(parsed).length) throw new Error(`${p}: no <url> entries`);
    Object.assign(entries, parsed);
  }
  return entries;
}

const readState = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);
function writeState(file, entries, now) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify({ date: now.toISOString(), entries }));
  renameSync(`${file}.tmp`, file);
}

/**
 * One run. Returns { sent, status, baseline? , error? }; never throws.
 * State is saved only after IndexNow accepted (200/202), so a failed POST is retried by the next release.
 */
export async function runIndexNow({ file = STATE_FILE, get, post, now = new Date(), dryRun = false } = {}) {
  try {
    const current = await fetchSitemaps(get);
    const state = readState(file);
    if (!state) {
      if (!dryRun) writeState(file, current, now);
      return { sent: 0, status: null, baseline: Object.keys(current).length };
    }
    const urls = changedUrls(state.entries ?? {}, current);
    if (!urls.length || dryRun) return { sent: 0, changed: urls.length, status: null };
    const status = await ping(urls, post);
    if (status === 200 || status === 202) writeState(file, current, now);
    return { sent: urls.length, status };
  } catch (error) {
    return { sent: 0, status: null, error: String(error?.message ?? error) };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runIndexNow({ dryRun: process.argv.includes("--dry-run") });
  console.log(JSON.stringify({ indexnow: result }));
}

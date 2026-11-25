// Pure helpers for scripts/seo/index-status.mjs (Push CC3). No network, no secrets.
import { createSign } from "node:crypto";

export const SITE = "https://www.localley.io";
export const PROPERTY = "sc-domain:localley.io";
export const MAX_URLS = 20; // URL Inspection quota is 2000/day per property; we stay far below it.

// Money and entry pages: pricing, home, hubs, A-Z lists, help guides and the journal.
export const DEFAULT_PATHS = [
  "/", "/pricing", "/spots",
  "/spots?city=seoul", "/spots?city=tokyo", "/spots?city=bangkok", "/spots?city=singapore",
  "/spots?city=osaka", "/spots?city=taipei",
  "/spots/a-z/seoul", "/spots/a-z/tokyo",
  "/trending", "/templates",
  "/help", "/help/korea/pay", "/help/japan/pay",
  "/blog", "/blog/paying-in-seoul", "/blog/paying-in-bangkok", "/blog/paying-in-singapore",
];

/** Google says "Submitted and indexed" or "Indexed, not submitted in sitemap" for indexed URLs. */
export function isIndexed(coverageState) {
  return /^(submitted and indexed|indexed, not submitted)/i.test(String(coverageState ?? ""));
}

/** One URL Inspection API response body -> one compact row. Unknown fields stay null. */
export function parseInspection(path, body) {
  const s = body?.inspectionResult?.indexStatusResult ?? {};
  const coverage = s.coverageState ?? null;
  return {
    path,
    coverage,
    verdict: s.verdict ?? null,
    indexed: isIndexed(coverage),
    lastCrawl: s.lastCrawlTime ?? null,
    googleCanonical: s.googleCanonical ? s.googleCanonical.replace(SITE, "") || "/" : null,
  };
}

/** Rows -> the summary line for the business-metrics notes. */
export function summarizeRows(rows, at) {
  const checked = rows.filter((r) => !r.error);
  const indexed = checked.filter((r) => r.indexed).length;
  return { at, indexed, checked: checked.length, errors: rows.length - checked.length, line: `indexed ${indexed}/${checked.length}` };
}

/** Notes fragment read by scripts/business-metrics.mjs; stale (> 14 d) or missing data says so. */
export function indexNote(state, now = Date.now()) {
  const ms = Date.parse(state?.summary?.at ?? "");
  if (!Number.isFinite(ms)) return "google index of money/entry pages: unknown (no index-status run)";
  const day = new Date(ms).toISOString().slice(0, 10);
  const stale = now - ms > 14 * 86_400_000 ? ", stale" : "";
  const sm = state.sitemap;
  const sitemap = sm?.read ? `; sitemap read ${sm.read}, ${sm.submitted} submitted, ${sm.indexed} indexed` : "";
  return `google index of money/entry pages: ${state.summary.line} (URL Inspection ${day}${stale})${sitemap}`;
}

/**
 * Push DI1: Search Console sitemaps list -> last Google read day + web URLs submitted/indexed (summed over sitemaps).
 * Answers "did Google read the sitemap at all" next to the per-URL inspection. Bad body -> null.
 */
export function parseSitemaps(body) {
  const list = Array.isArray(body?.sitemap) ? body.sitemap : null;
  if (!list) return null;
  let read = "", submitted = 0, indexed = 0;
  for (const s of list) {
    const day = String(s?.lastDownloaded ?? "").slice(0, 10);
    if (day > read) read = day;
    for (const c of Array.isArray(s?.contents) ? s.contents : []) {
      if (c?.type !== "web") continue;
      submitted += Number(c.submitted) || 0;
      indexed += Number(c.indexed) || 0;
    }
  }
  return { read: read || null, submitted, indexed };
}

/** Service-account JWT for the OAuth token exchange (RS256). */
export function serviceAccountJwt(key, scope, nowSec = Math.floor(Date.now() / 1000)) {
  const b64 = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
  const head = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: key.client_email, scope, aud: key.token_uri, iat: nowSec, exp: nowSec + 3600 })}`;
  return `${head}.${createSign("RSA-SHA256").update(head).sign(key.private_key).toString("base64url")}`;
}

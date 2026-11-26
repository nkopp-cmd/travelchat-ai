// Pure helpers for scripts/seo/click-depth.mjs (Push DK3): click depth from / over internal links.

const SKIP = /^\/(api|_next|sign-in|sign-up|auth|settings|dashboard|admin|chat|itineraries\/new)(\/|$)|\.(png|jpe?g|webp|avif|svg|ico|xml|txt|json|css|js)$/i;

/** Normalized same-site paths (path + query, no hash) from anchor hrefs in an HTML page. */
export function internalLinks(html, origin = "https://www.localley.io") {
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
    const raw = m[1].replace(/&amp;/g, "&");
    let u;
    try { u = new URL(raw, origin); } catch { continue; }
    if (!/^(www\.)?localley\.io$/.test(u.hostname) && u.origin !== origin) continue;
    if (SKIP.test(u.pathname)) continue;
    const path = (u.pathname.replace(/\/$/, "") || "/") + u.search;
    out.add(path);
  }
  return out;
}

/** Page type of a path, for the DK3 budget: city <= 2 clicks, spot <= 3. */
export function pageType(path) {
  if (/^\/spots\/[0-9a-f-]{36}$/i.test(path)) return "spot";
  if (/^\/spots\/a-z\/[a-z0-9-]+$/.test(path) || /^\/spots\?city=[a-z0-9-]+$/.test(path)) return "city";
  return "other";
}

/**
 * Breadth-first click depth. `links(path)` returns the outgoing paths of a page (sync map lookup in tests,
 * prefetched in the script). Pages deeper than maxDepth are not expanded. Returns Map path -> depth.
 */
export function bfsDepth(start, links, maxDepth) {
  const depth = new Map([[start, 0]]);
  let frontier = [start];
  for (let d = 0; d < maxDepth && frontier.length; d++) {
    const next = [];
    for (const p of frontier) for (const q of links(p) ?? []) if (!depth.has(q)) { depth.set(q, d + 1); next.push(q); }
    frontier = next;
  }
  return depth;
}

/** Budget check: targets (paths) with their type; returns {type: {total, within, over: [paths]}}. */
export function depthReport(targets, depth, budget = { city: 2, spot: 3 }) {
  const report = {};
  for (const path of targets) {
    const type = pageType(path);
    if (!(type in budget)) continue;
    const r = (report[type] ??= { total: 0, within: 0, over: [] });
    r.total++;
    const d = depth.get(path);
    if (d !== undefined && d <= budget[type]) r.within++;
    else r.over.push(path);
  }
  return report;
}

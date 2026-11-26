// Push DO3: every indexable spot page keeps its way to the free planner (spot pages are the organic entry).

/** Spot id from a /spots/<id> URL, or null. */
export function spotIdOf(url) {
  try {
    const m = /^\/spots\/([A-Za-z0-9_-]{1,128})\/?$/.exec(new URL(url).pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** The <loc> URLs of a sitemap XML. */
export function sitemapLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

/**
 * The best planner link on a spot page: "spot" (opens the planner with this spot pinned in its city), "city" (Push CK1
 * day-trip fallback: the nearest planner city's plan, because the planner drops a pin outside its city) or null.
 * href order-free, &amp; or &.
 */
export function plannerCtaKind(html, spotId) {
  let kind = null;
  for (const [, raw] of html.matchAll(/href="(\/itineraries\/new\?[^"]*)"/g)) {
    const params = new URLSearchParams(raw.slice(raw.indexOf("?") + 1).replace(/&amp;/g, "&"));
    if (!params.get("city")) continue;
    if (params.get("spot") === spotId) return "spot";
    kind = "city";
  }
  return kind;
}

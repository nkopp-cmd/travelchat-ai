/**
 * Critical CSS for spot detail HTML (Push AL2, spot hero LCP).
 *
 * Spot pages render per request and are edge-cached for an hour (edge-html-cache.ts). Their three stylesheets
 * blocked the first paint: the hero photo arrived in 180 ms, LCP still waited on the 25 KB gzip global sheet.
 * The build writes the critical rules of the spot template per stylesheet (scripts/cf-static-public-html.mjs,
 * SPOT_CRITICAL_CSS_ASSET); on an edge-cache miss the Worker inlines them and loads the full sheets async, the same
 * shape as the static home page. The cached copy carries the result, so a HIT costs nothing extra.
 *
 * Safe by default: any mismatch (other sheets, already async links, no </head>) leaves the HTML unchanged.
 */
export const SPOT_CRITICAL_CSS_PATH = "/_localley/critical-spot.json";

export interface CriticalCss {
  /** stylesheet href -> critical rules of the spot template from that sheet */
  css: Record<string, string>;
}

const STYLESHEET_LINK = /<link\b[^>]*\brel="stylesheet"[^>]*>/g;
const hrefOf = (tag: string) => /\bhref="([^"]+)"/.exec(tag)?.[1] ?? null;

export function isCriticalCss(value: unknown): value is CriticalCss {
  if (!value || typeof value !== "object") return false;
  const css = (value as { css?: unknown }).css;
  return !!css && typeof css === "object"
    && Object.values(css).every((rules) => typeof rules === "string" && !/<\/style/i.test(rules));
}

/** The HTML with critical CSS inlined and async full sheets, or null when the page does not match the build's sheets. */
export function applyCriticalCss(html: string, critical: CriticalCss): string | null {
  const headEnd = html.indexOf("</head>");
  if (headEnd < 0) return null;
  const head = html.slice(0, headEnd);
  if (head.includes("<noscript>")) return null;
  const links = head.match(STYLESHEET_LINK) ?? [];
  const hrefs = links.map(hrefOf);
  const known = Object.keys(critical.css);
  if (!links.length || links.some((tag) => /\bmedia=/.test(tag))) return null;
  if (hrefs.length !== known.length || hrefs.some((href) => !href || !Object.hasOwn(critical.css, href))) return null;
  if (new Set(hrefs).size !== hrefs.length) return null;
  // Same href, so React finds the resource on hydration and does not insert a blocking copy (as on "/").
  const rewritten = head.replace(STYLESHEET_LINK, (tag) => {
    const rules = critical.css[hrefOf(tag)!];
    const asyncTag = tag.replace(/\s*\/?>$/, ` media="print" onload="this.media='all'">`);
    return `${rules ? `<style>${rules}</style>` : ""}${asyncTag}`;
  });
  return `${rewritten}<noscript>${links.join("")}</noscript>${html.slice(headEnd)}`;
}

interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

let loaded: Promise<CriticalCss | null> | undefined;

/** Reads the build's critical CSS from the static assets once per isolate (a failed read retries on the next miss). */
export function loadCriticalCss(assets: AssetFetcher | undefined): Promise<CriticalCss | null> {
  if (!assets) return Promise.resolve(null);
  loaded ??= assets.fetch(new Request(`https://assets.local${SPOT_CRITICAL_CSS_PATH}`))
    .then(async (response) => {
      const body: unknown = response.ok ? await response.json() : null;
      return isCriticalCss(body) ? body : null;
    })
    .catch(() => null)
    .then((value) => {
      if (!value) loaded = undefined;
      return value;
    });
  return loaded;
}

/** Response with critical CSS applied; the original bytes when the build has none or the page does not match. */
export async function withCriticalCss(response: Response, critical: CriticalCss | null): Promise<Response> {
  if (!critical) return response;
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(applyCriticalCss(html, critical) ?? html, { status: response.status, statusText: response.statusText, headers });
}

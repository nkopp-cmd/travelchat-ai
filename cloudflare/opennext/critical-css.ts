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
import { deferChunkScripts, SPOT_HERO } from "../../scripts/cf-defer-scripts.mjs";

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

/**
 * Push AM2: after critical CSS, the spot page's client chunks (~190 KB gzip) and full sheets start after the hero photo
 * has painted (scripts/cf-defer-scripts.mjs, the same loader as "/"). Only when critical CSS applied (the sheets are
 * then async); any failure keeps the critical-CSS HTML.
 */
export function deferSpotChunks(html: string | null): string | null {
  if (html === null) return null;
  try {
    return deferChunkScripts(html, SPOT_HERO);
  } catch {
    return html;
  }
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

/**
 * Push CI2: Next.js also sends `Link: <sheet>; rel=preload; as="style"` for every stylesheet of a dynamic page. The
 * browser fetched those 29 KB at VeryHigh priority before the hero photo (PSI mobile: sheets at +7 ms after the
 * document, hero at +12 ms; image LCP 1.2 s on every photo spot page while text spots were 0.93 s), which undid the
 * async sheets above. When the sheets are made async, their preload entries leave the header; other entries stay.
 */
export function withoutSheetPreloads(link: string, critical: CriticalCss): string {
  return link.split(/,\s*(?=<)/)
    .filter((entry) => {
      const href = /^<([^>]*)>/.exec(entry.trim())?.[1];
      return !(href && Object.hasOwn(critical.css, href) && /;\s*rel="?preload"?/i.test(entry) && /;\s*as="?style"?/i.test(entry));
    })
    .join(", ");
}

/** Response with critical CSS applied; the original bytes when the build has none or the page does not match. */
export async function withCriticalCss(response: Response, critical: CriticalCss | null): Promise<Response> {
  if (!critical) return response;
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  const rewritten = deferSpotChunks(applyCriticalCss(html, critical));
  const link = headers.get("link");
  if (rewritten !== null && link) {
    const kept = withoutSheetPreloads(link, critical);
    if (kept) headers.set("link", kept);
    else headers.delete("link");
  }
  return new Response(rewritten ?? html, { status: response.status, statusText: response.statusText, headers });
}

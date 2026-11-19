import assert from "node:assert/strict";

/**
 * Start the Next.js client chunks after the hero image has painted (Push AL3 attempt 5, home LCP).
 *
 * After critical CSS (attempt 4) nothing blocks the first paint, but ~190 KB gzip of async framework JS still
 * downloads in parallel with the 29 KB hero. Lighthouse's lantern LCP counts every request that starts before the
 * observed LCP, so those bytes pushed mobile LCP to 1.5-2.0 s. Here the chunk <script async> tags and script
 * preloads leave the HTML; a tiny inline loader adds them (same order, still async) once the hero has loaded and one
 * frame has painted, or at the first input, or after 3 s, whichever comes first. The page is plain links and text
 * until then; hydration starts a few hundred ms later on a fast phone.
 *
 * The loader only adds nodes to <head>; React 19 skips unknown <head> nodes during hydration.
 *
 * Attempt 6: the full stylesheets (async media=print links after critical CSS, ~28 KB gzip in 3 requests) also
 * started before the first paint and shared the throttled link with the hero. The loader now adds them too, first,
 * with data-precedence kept so React 19 finds them as its own stylesheet resources at hydration. The critical
 * <style> covers the first screen; the <noscript> copies stay for visitors without JS.
 *
 * Push AT1 attempt 3: the loader fired ~40 ms before the hero actually painted (load + one frame = 166 ms, observed LCP
 * 208 ms), so lantern still counted 28 KB of VeryHigh CSS and the High-priority scripts as LCP blockers (simulated LCP
 * 1.2-1.6 s while the observed LCP was ~207 ms). The loader now also waits for the hero's own largest-contentful-paint
 * entry. When another element is larger than the hero's visible area (the hero can never be the LCP), the hero load
 * alone is enough. Without LCP support, on hero error, in background tabs (no LCP entry), at the first input or after
 * 3 s it behaves as before.
 */
export const HERO_SELECTOR = "img.ll-hero-poster";
/** The page's LCP image: a marker that must be in the HTML and the selector the loader waits for. */
export const HOME_HERO = { marker: /class="ll-hero-poster"/, selector: HERO_SELECTOR };
// Push AM2: spot detail pages (Worker edge-cache miss rewrite, cloudflare/opennext/critical-css.ts). Their hero is the
// next/image photo with fetchPriority="high"; a spot without a photo has no such image and stays unchanged.
export const SPOT_HERO = { marker: /<img\b[^>]*\bfetchPriority="high"/, selector: 'img[fetchpriority="high"]' };
export const DEFER_FALLBACK_MS = 3000;

const CHUNK_SCRIPT = /<script\b(?=[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)")(?=[^>]*\basync\b)(?![^>]*\bnomodule\b)[^>]*><\/script>/gi;
const ASYNC_SHEET = /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bmedia="print")(?=[^>]*\bhref="(\/_next\/static\/[^"]+\.css)")[^>]*\/?>/gi;
const SCRIPT_PRELOAD = /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="script")(?=[^>]*\bhref="(\/_next\/static\/[^"]+\.js)")[^>]*\/?>/gi;

export function loaderScript(scripts, preloads, sheets = [], selector = HERO_SELECTOR) {
  const json = (list) => JSON.stringify(list).replace(/</g, "\\u003c");
  return `<script>(function(){var S=${json(scripts)},P=${json(preloads)},C=${json(sheets)},d=0,h=document.head;`
    + `function go(){if(d)return;d=1;C.forEach(function(u){var l=document.createElement("link");l.rel="stylesheet";l.href=u;l.setAttribute("data-precedence","next");h.appendChild(l)});P.forEach(function(u){var l=document.createElement("link");l.rel="preload";l.as="script";l.href=u;h.appendChild(l)});`
    + `S.forEach(function(u){var e=document.createElement("script");e.src=u;e.async=true;h.appendChild(e)})}`
    + `function later(){requestAnimationFrame(function(){setTimeout(go,0)})}`
    + `var i=document.querySelector(${JSON.stringify(selector).replace(/</g, "\\u003c")});`
    + `var L=0,H=0,M=0,t=self.PerformanceObserver,y=t&&t.supportedEntryTypes;`
    + `if(!i||!y||y.indexOf("largest-contentful-paint")<0)H=1;`
    + `function A(){var r=i.getBoundingClientRect(),w=Math.min(r.right,innerWidth)-Math.max(r.left,0),v=Math.min(r.bottom,innerHeight)-Math.max(r.top,0);return w>0&&v>0?w*v:0}`
    + `function k(){if(L&&(H||M>A()))later()}`
    + `if(!H)try{new t(function(l){l.getEntries().forEach(function(e){if(e.element===i)H=1;else if(e.size>M)M=e.size});k()}).observe({type:"largest-contentful-paint",buffered:true})}catch(x){H=1}`
    + `function f(){L=1;k()}function g(){L=H=1;k()}`
    + `if(!i||i.complete)f();else{i.addEventListener("load",f);i.addEventListener("error",g)}`
    + `["pointerdown","keydown","touchstart"].forEach(function(t){addEventListener(t,go,{once:true,passive:true})});`
    + `setTimeout(go,${DEFER_FALLBACK_MS})})()</script>`;
}

/** The HTML with chunk scripts started by the loader; the same bytes when the page has no hero or no chunks. */
export function deferChunkScripts(html, hero = HOME_HERO) {
  if (!hero.marker.test(html)) return html;
  const scripts = [...html.matchAll(CHUNK_SCRIPT)].map((m) => m[1]);
  if (!scripts.length) return html;
  const preloads = [...html.matchAll(SCRIPT_PRELOAD)].map((m) => m[1]).filter((u) => !scripts.includes(u));
  const headEnd = html.indexOf("</head>");
  const head = headEnd < 0 ? "" : html.slice(0, headEnd).replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
  const sheets = [...new Set([...head.matchAll(ASYNC_SHEET)].map((m) => m[1]))];
  const withoutSheets = headEnd < 0 ? html : html.slice(0, headEnd).replace(/(<noscript>[\s\S]*?<\/noscript>)|<link\b[^>]*>/gi,
    (tag, noscript) => (noscript || !new RegExp(ASYNC_SHEET.source, "i").test(tag) ? tag : "")) + html.slice(headEnd);
  const out = withoutSheets.replace(CHUNK_SCRIPT, "").replace(SCRIPT_PRELOAD, "")
    .replace("</body>", `${loaderScript(scripts, [...new Set(preloads)], sheets, hero.selector)}</body>`);
  assert.equal([...out.matchAll(CHUNK_SCRIPT)].length, 0, "a chunk script still starts before the hero");
  assert.ok(out.includes("</body>") && out.length < html.length + 2048, "loader not inserted");
  return out;
}

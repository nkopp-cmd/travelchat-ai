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
 */
export const HERO_SELECTOR = "img.ll-hero-poster";
export const DEFER_FALLBACK_MS = 3000;

const CHUNK_SCRIPT = /<script\b(?=[^>]*\bsrc="(\/_next\/static\/[^"]+\.js)")(?=[^>]*\basync\b)(?![^>]*\bnomodule\b)[^>]*><\/script>/gi;
const SCRIPT_PRELOAD = /<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="script")(?=[^>]*\bhref="(\/_next\/static\/[^"]+\.js)")[^>]*\/?>/gi;

export function loaderScript(scripts, preloads) {
  const json = (list) => JSON.stringify(list).replace(/</g, "\\u003c");
  return `<script>(function(){var S=${json(scripts)},P=${json(preloads)},d=0,h=document.head;`
    + `function go(){if(d)return;d=1;P.forEach(function(u){var l=document.createElement("link");l.rel="preload";l.as="script";l.href=u;h.appendChild(l)});`
    + `S.forEach(function(u){var e=document.createElement("script");e.src=u;e.async=true;h.appendChild(e)})}`
    + `function later(){requestAnimationFrame(function(){setTimeout(go,0)})}`
    + `var i=document.querySelector(${JSON.stringify(HERO_SELECTOR)});`
    + `if(!i||i.complete)later();else{i.addEventListener("load",later);i.addEventListener("error",later)}`
    + `["pointerdown","keydown","touchstart"].forEach(function(t){addEventListener(t,go,{once:true,passive:true})});`
    + `setTimeout(go,${DEFER_FALLBACK_MS})})()</script>`;
}

/** The HTML with chunk scripts started by the loader; the same bytes when the page has no hero or no chunks. */
export function deferChunkScripts(html) {
  if (!html.includes('class="ll-hero-poster"')) return html;
  const scripts = [...html.matchAll(CHUNK_SCRIPT)].map((m) => m[1]);
  if (!scripts.length) return html;
  const preloads = [...html.matchAll(SCRIPT_PRELOAD)].map((m) => m[1]).filter((u) => !scripts.includes(u));
  const out = html.replace(CHUNK_SCRIPT, "").replace(SCRIPT_PRELOAD, "")
    .replace("</body>", `${loaderScript(scripts, [...new Set(preloads)])}</body>`);
  assert.equal([...out.matchAll(CHUNK_SCRIPT)].length, 0, "a chunk script still starts before the hero");
  assert.ok(out.includes("</body>") && out.length < html.length + 2048, "loader not inserted");
  return out;
}

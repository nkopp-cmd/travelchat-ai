import { describe, expect, it, vi } from "vitest";
import { applyCriticalCss, isCriticalCss, loadCriticalCss, SPOT_CRITICAL_CSS_PATH, withCriticalCss, withoutSheetPreloads } from "@/cloudflare/opennext/critical-css";
import { EDGE_CACHE_HEADER, serveWithEdgeCache } from "@/cloudflare/opennext/edge-html-cache";
// @ts-expect-error -- plain ESM build script without type declarations
import { SPOT_CRITICAL_CSS_ASSET } from "../scripts/cf-static-public-html.mjs";

const A = "/_next/static/chunks/a.css";
const B = "/_next/static/chunks/b.css";
const critical = { css: { [A]: ".hero{color:#fff}", [B]: "" } };
// Spot page order (b before a) differs from the build's key order: the page order must win.
const spot = `<!DOCTYPE html><html><head><meta charSet="utf-8"/><link rel="stylesheet" href="${B}" data-precedence="next"/>`
  + `<link rel="stylesheet" href="${A}" data-precedence="next"/><title>Spot</title></head><body><h1 class="hero">x</h1></body></html>`;
const SPOT_URL = "https://www.localley.io/spots/0022dc9c-5f13-41fd-9940-38a190795704";

describe("spot critical CSS", () => {
  it("inlines the rules in page order, makes every sheet async and keeps a noscript fallback", () => {
    const out = applyCriticalCss(spot, critical)!;
    const head = out.slice(0, out.indexOf("</head>"));
    expect(head).toContain(`<link rel="stylesheet" href="${B}" data-precedence="next" media="print" onload="this.media='all'"><style>.hero{color:#fff}</style><link rel="stylesheet" href="${A}" data-precedence="next" media="print" onload="this.media='all'">`);
    expect(head.replace(/<noscript>[\s\S]*?<\/noscript>/, "")).not.toMatch(/<link\b(?![^>]*media="print")[^>]*rel="stylesheet"/);
    expect(head).toContain(`<noscript><link rel="stylesheet" href="${B}" data-precedence="next"/><link rel="stylesheet" href="${A}" data-precedence="next"/></noscript>`);
    expect(out.slice(out.indexOf("</head>"))).toBe(spot.slice(spot.indexOf("</head>")));
  });

  it("leaves pages that do not link exactly the build's sheets unchanged", () => {
    expect(applyCriticalCss(spot.replace(B, "/_next/static/chunks/other.css"), critical)).toBeNull();
    expect(applyCriticalCss(spot.replace(`<link rel="stylesheet" href="${B}" data-precedence="next"/>`, ""), critical)).toBeNull();
    expect(applyCriticalCss(spot.replace(`href="${A}"`, `href="${A}" media="print"`), critical)).toBeNull();
    expect(applyCriticalCss(applyCriticalCss(spot, critical)!, critical)).toBeNull();
    expect(applyCriticalCss("<html><body>no head</body></html>", critical)).toBeNull();
  });

  it("accepts only a well-formed asset", () => {
    expect(isCriticalCss(critical)).toBe(true);
    expect(isCriticalCss({ css: { [A]: "</style><script>" } })).toBe(false);
    expect(isCriticalCss({ css: { [A]: 1 } })).toBe(false);
    expect(isCriticalCss(null)).toBe(false);
    expect(SPOT_CRITICAL_CSS_PATH).toBe(`/${SPOT_CRITICAL_CSS_ASSET}`);
  });

  it("loads the asset once per isolate and retries after a failed read", async () => {
    const assets = { fetch: vi.fn(async () => new Response("nope", { status: 404 })) };
    expect(await loadCriticalCss(assets)).toBeNull();
    assets.fetch.mockImplementation(async () => Response.json(critical));
    expect(await loadCriticalCss(assets)).toEqual(critical);
    expect(await loadCriticalCss(assets)).toEqual(critical);
    expect(assets.fetch).toHaveBeenCalledTimes(2);
    expect(new URL((assets.fetch.mock.calls[1] as unknown as [Request])[0].url).pathname).toBe(SPOT_CRITICAL_CSS_PATH);
    expect(await loadCriticalCss(undefined)).toBeNull();
  });

  it("keeps the original bytes without critical CSS or on a mismatch", async () => {
    const res = () => new Response(spot.replace(A, "/x.css"), { headers: { "content-type": "text/html", "content-length": "9" } });
    const same = res();
    expect(await withCriticalCss(same, null)).toBe(same);
    const mismatch = await withCriticalCss(res(), critical);
    expect(await mismatch.text()).toBe(spot.replace(A, "/x.css"));
    expect(mismatch.headers.has("content-length")).toBe(false);
  });

  it("push CI2: drops the build sheets' preload Link entries once the sheets are async, keeps other entries", async () => {
    // Live shape from Next.js on /spots/<id> (2026-11-22).
    const live = `</>; rel=preconnect; crossorigin="", <${B}>; rel=preload; as="style", <${A}>; rel=preload; as="style", </_next/static/chunks/other.css>; rel=preload; as="style"`;
    const page = (body: string, link: string) => new Response(body, { headers: { "content-type": "text/html", link } });
    const out = await withCriticalCss(page(spot, live), critical);
    expect(await out.text()).toContain("<style>.hero{color:#fff}</style>");
    expect(out.headers.get("link")).toBe(`</>; rel=preconnect; crossorigin="", </_next/static/chunks/other.css>; rel=preload; as="style"`);
    const only = await withCriticalCss(page(spot, `<${A}>; rel=preload; as="style", <${B}>; rel=preload; as=style`), critical);
    expect(only.headers.has("link")).toBe(false);
    // Blocking sheets (no rewrite) keep their preloads.
    const mismatch = await withCriticalCss(page(spot.replace(A, "/x.css"), live), critical);
    expect(mismatch.headers.get("link")).toBe(live);
    expect(withoutSheetPreloads(`<${A}>; rel=preload; as="font"`, critical)).toBe(`<${A}>; rel=preload; as="font"`);
  });

  it("edge cache: a spot MISS stores and serves the rewritten HTML; other pages are not rewritten", async () => {
    const store = new Map<string, Response>();
    const cache = { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => { store.set(r.url, res); } };
    const page = () => new Response(spot, { headers: { "content-type": "text/html; charset=utf-8" } });
    const rewrite = vi.fn(async (response: Response) => withCriticalCss(response, critical));
    const pending: Promise<unknown>[] = [];
    const serve = (url: string) => serveWithEdgeCache(new Request(url), "v1", cache, (p) => pending.push(p), async () => page(), rewrite);
    const miss = await serve(SPOT_URL);
    expect(miss.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    expect(await miss.text()).toContain("<style>.hero{color:#fff}</style>");
    await Promise.all(pending);
    const hit = await serve(SPOT_URL);
    expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await hit.text()).toContain("<style>.hero{color:#fff}</style>");
    expect(rewrite).toHaveBeenCalledTimes(1);
    expect(await (await serve("https://www.localley.io/pricing")).text()).toBe(spot);
    expect(await (await serve(`${SPOT_URL}?data_candidate=1`)).text()).toBe(spot);
    expect(rewrite).toHaveBeenCalledTimes(1);
  });
});

describe("spot chunks start after the hero (Push AM2)", () => {
  const hero = '<img alt="Spot" fetchPriority="high" data-nimg="fill" src="/media/spot/x.webp"/>';
  const withChunks = (body: string) => spot.replace("<title>", '<script src="/_next/static/chunks/main.js" async=""></script><title>')
    .replace("</body>", `${body}<script src="/_next/static/chunks/page.js" async=""></script></body>`);

  it("moves the chunks and the async sheets into the post-hero loader after critical CSS", async () => {
    const out = await (await withCriticalCss(new Response(withChunks(hero), { headers: { "content-type": "text/html" } }), critical)).text();
    expect(out).toContain("<style>.hero{color:#fff}</style>");
    expect(out).not.toMatch(/<script src="\/_next\/static\/chunks\/(main|page)\.js"/);
    expect(out).not.toMatch(/media="print"/);
    expect(out).toContain(`var S=["/_next/static/chunks/main.js","/_next/static/chunks/page.js"]`);
    expect(out).toContain(`C=["${B}","${A}"]`);
    expect(out).toContain(`<noscript><link rel="stylesheet" href="${B}" data-precedence="next"/>`);
  });

  it("keeps the chunks for a spot without a photo and never defers without critical CSS", async () => {
    const noPhoto = await (await withCriticalCss(new Response(withChunks("<p>x</p>")), critical)).text();
    expect(noPhoto).toContain('<script src="/_next/static/chunks/page.js" async=""></script>');
    expect(noPhoto).toContain("<style>.hero{color:#fff}</style>");
    const mismatch = withChunks(hero).replace(A, "/x.css");
    expect(await (await withCriticalCss(new Response(mismatch), critical)).text()).toBe(mismatch);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { APP_TOP_LEVEL_NAMES, EDGE_AUTH_REDIRECTS, EDGE_AUTH_WALL_REDIRECTS, EDGE_CACHE_HEADER, EDGE_STALE_SECONDS, edgeTtlSeconds, isEdgeCacheable, isUnknownPagePath, serveWithEdgeCache, withoutTracking } from "@/cloudflare/opennext/edge-html-cache";
import { GENERATED_PREVIEW_PATH } from "@/lib/trips/generated-preview";
import { PLANNER_RESUME_PATH } from "@/lib/trips/planner-draft";
import { checkoutSignUpUrl } from "@/lib/pricing-checkout";
import { authCopy } from "@/lib/auth/auth-copy";

function memoryCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { store.set(request.url, response); }),
    delete: vi.fn(async (request: Request) => store.delete(request.url)),
  };
}

const html = (headers: Record<string, string> = {}) => new Response("<html>home</html>", {
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": "s-maxage=31536000", ...headers },
});

async function serve(request: Request, cache: ReturnType<typeof memoryCache>, handler: (r: Request) => Promise<Response>, version: string | undefined = "v1", now: () => number = Date.now) {
  const pending: Promise<unknown>[] = [];
  const response = await serveWithEdgeCache(request, version, cache, (p) => pending.push(p), handler, undefined, now);
  // A stale refresh stores its copy from inside its own waitUntil: drain until nothing new is queued.
  for (let done = 0; done < pending.length; done = pending.length) await Promise.all(pending.slice(done));
  return response;
}

describe("public HTML edge cache", () => {
  it("renders once, then serves the stored HTML with the origin cache header", async () => {
    const cache = memoryCache();
    const handler = vi.fn(async () => html());
    const first = await serve(new Request("https://www.localley.io/"), cache, handler);
    expect(first.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    expect(await first.text()).toBe("<html>home</html>");
    const second = await serve(new Request("https://www.localley.io/"), cache, handler);
    expect(second.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(second.headers.get("cache-control")).toBe("s-maxage=31536000");
    expect(second.headers.has("x-localley-origin-cache-control")).toBe(false);
    expect(await second.text()).toBe("<html>home</html>");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keys entries by Worker version so a deploy renders fresh HTML", async () => {
    const cache = memoryCache();
    const handler = vi.fn(async () => html());
    await serve(new Request("https://www.localley.io/pricing"), cache, handler, "v1");
    const next = await serve(new Request("https://www.localley.io/pricing"), cache, handler, "v2");
    expect(next.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("keeps the live spots catalog for five minutes and prerenders for a day", async () => {
    const cache = memoryCache();
    await serve(new Request("https://www.localley.io/spots"), cache, async () => html({ "cache-control": "private, no-store" }));
    await serve(new Request("https://www.localley.io/"), cache, async () => html());
    const stored = [...cache.store.entries()];
    expect(stored.find(([url]) => url.includes("/spots?"))?.[1].headers.get("cache-control")).toBe(`public, s-maxage=${300 + EDGE_STALE_SECONDS}`);
    expect(stored.find(([url]) => url.startsWith("https://www.localley.io/?"))?.[1].headers.get("cache-control")).toBe(`public, s-maxage=${86400 + EDGE_STALE_SECONDS}`);
    const hit = await serve(new Request("https://www.localley.io/spots"), cache, async () => html());
    expect(hit.headers.get("cache-control")).toBe("private, no-store");
  });

  it("never stores responses that set cookies, fail, or are not HTML", async () => {
    for (const response of [html({ "set-cookie": "a=1" }), new Response("x", { status: 500, headers: { "content-type": "text/html" } }), new Response("{}", { headers: { "content-type": "application/json" } })]) {
      const cache = memoryCache();
      await serve(new Request("https://www.localley.io/"), cache, async () => response);
      expect(cache.put).not.toHaveBeenCalled();
    }
  });

  it("stores sitemaps for an hour as XML and never stores a non-XML or missing sitemap", async () => {
    const xml = () => new Response("<urlset/>", { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
    for (const path of ["/sitemap.xml", "/sitemaps/pages.xml", "/sitemaps/guides.xml", "/sitemaps/spots-12.xml"]) {
      expect(edgeTtlSeconds(path)).toBe(3600);
      const cache = memoryCache();
      const handler = vi.fn(async () => xml());
      expect((await serve(new Request(`https://www.localley.io${path}`), cache, handler)).headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
      const hit = await serve(new Request(`https://www.localley.io${path}`), cache, handler);
      expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
      expect(hit.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(await hit.text()).toBe("<urlset/>");
      expect(handler).toHaveBeenCalledTimes(1);
    }
    for (const path of ["/sitemaps/other.xml", "/sitemaps/spots-0.xml", "/sitemaps/spots-12345.xml", "/sitemaps/pages.xml/x"]) {
      expect(edgeTtlSeconds(path)).toBeUndefined();
    }
    expect(isEdgeCacheable(new Request("https://www.localley.io/sitemap.xml?x=1"))).toBe(false);
    for (const response of [html(), new Response("missing", { status: 404, headers: { "content-type": "application/xml" } })]) {
      const cache = memoryCache();
      await serve(new Request("https://www.localley.io/sitemaps/spots-99.xml"), cache, async () => response);
      expect(cache.put).not.toHaveBeenCalled();
    }
  });

  it("bypasses the cache for other routes, queries, methods, RSC requests and missing versions", async () => {
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/abc"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/15614d97-380f-4e8d-8aa6-aa6f43609bcf"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/15614d97-380f-4e8d-8aa6-aa6f43609bcf?data_candidate=d1"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/15614D97-380F-4E8D-8AA6-AA6F43609BCF"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/15614d97-380f-4e8d-8aa6-aa6f43609bcf/edit"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/submit"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/submit?url=https%3A%2F%2Fwww.instagram.com%2Fp%2Fx"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/submissions"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/privacy"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/terms"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/credits"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/trending"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/trending/justin-bieber-seoul-2026-10"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/trending/justin-bieber-seoul-2026-10?x=1"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/trending/Justin-Bieber"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/trending/a/b"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/itineraries/new"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/itineraries/new?city=Seoul"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/itineraries/preview"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/itineraries/preview?payment=success"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/itineraries/preview", { headers: { rsc: "1" } }))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/itineraries/abc"))).toBe(false);
    for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) {
      expect(isEdgeCacheable(new Request(`https://www.localley.io${path}`))).toBe(true);
      expect(isEdgeCacheable(new Request(`https://www.localley.io${path}?redirect_url=%2Fusers%2Fx`))).toBe(false);
    }
    // Push BB1: a signed-in visitor must reach the page, which redirects them on; a cached form would stop them.
    for (const path of ["/sign-in", "/sign-up", "/sign-up?redirect_url=%2Fitineraries%2Fpreview"]) {
      for (const cookie of ["__Secure-better-auth.session_token=t.s", "better-auth.session_token=t.s"]) {
        expect(isEdgeCacheable(new Request(`https://www.localley.io${path}`, { headers: { cookie } }))).toBe(false);
      }
      expect(isEdgeCacheable(new Request(`https://www.localley.io${path}`, { headers: { cookie: "lly_hint=1" } }))).toBe(true);
    }
    expect(isEdgeCacheable(new Request("https://www.localley.io/reset-password"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=atlantis"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul&category=Food"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul&view=map"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?view=list&city=tokyo"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?view=map"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul&view=grid"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul&view=map&view=list"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul&city=tokyo"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul&view=map&category=Food"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=atlantis&view=map"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=Seoul"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/pricing?city=seoul"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/?utm=x"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/", { method: "POST" }))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/", { method: "HEAD" }))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/", { headers: { rsc: "1" } }))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/", { headers: { "next-router-prefetch": "1" } }))).toBe(false);
    const cache = memoryCache();
    const response = await serveWithEdgeCache(new Request("https://www.localley.io/"), undefined, cache, () => undefined, async () => html());
    expect(response.headers.has(EDGE_CACHE_HEADER)).toBe(false);
    expect(cache.match).not.toHaveBeenCalled();
  });

  it("caches the static /templates page for a day", async () => {
    const cache = memoryCache();
    await serve(new Request("https://www.localley.io/templates"), cache, async () => html());
    const stored = [...cache.store.entries()];
    expect(stored.find(([url]) => url.includes("/templates?"))?.[1].headers.get("cache-control")).toBe(`public, s-maxage=${86400 + EDGE_STALE_SECONDS}`);
  });

  it("keeps a spot detail page for one hour under its own path", async () => {
    const cache = memoryCache();
    const path = "https://www.localley.io/spots/15614d97-380f-4e8d-8aa6-aa6f43609bcf";
    const handler = vi.fn(async () => html({ "cache-control": "private, no-store" }));
    expect((await serve(new Request(path), cache, handler)).headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    const hit = await serve(new Request(path), cache, handler);
    expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(hit.headers.get("cache-control")).toBe("private, no-store");
    expect(handler).toHaveBeenCalledTimes(1);
    expect([...cache.store.keys()]).toEqual([`${path}?__edge=v1`]);
    expect(cache.store.get(`${path}?__edge=v1`)?.headers.get("cache-control")).toBe(`public, s-maxage=${3600 + EDGE_STALE_SECONDS}`);
  });

  it("treats ad and social click-tracking keys as the plain page: one entry, rewritten once, no tracking value rendered (Push AV1)", async () => {
    const cache = memoryCache();
    const spot = "https://www.localley.io/spots/15614d97-380f-4e8d-8aa6-aa6f43609bcf";
    const seen: string[] = [];
    const handler = vi.fn(async (request: Request) => { seen.push(request.url); return html({ "cache-control": "private, no-store" }); });
    const rewrite = vi.fn(async (response: Response) => new Response("<html>rewritten</html>", response));
    const pending: Promise<unknown>[] = [];
    const first = await serveWithEdgeCache(new Request(`${spot}?utm_source=instagram&utm_medium=social&fbclid=IwAR1`), "v1", cache, (p) => pending.push(p), handler, rewrite);
    await Promise.all(pending);
    expect(first.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    expect(await first.text()).toBe("<html>rewritten</html>");
    expect(seen).toEqual([spot]);
    for (const query of ["", "?ttclid=E.C.P", "?gclid=abc&utm_campaign=seoul", "?igshid=x", "?igsh=y&si=z"]) {
      const hit = await serve(new Request(`${spot}${query}`), cache, handler);
      expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
      expect(await hit.text()).toBe("<html>rewritten</html>");
    }
    expect(handler).toHaveBeenCalledTimes(1);
    expect(rewrite).toHaveBeenCalledTimes(1);
    expect([...cache.store.keys()]).toEqual([`${spot}?__edge=v1`]);
    // Real keys still decide: a tracking key next to one keeps the old answer for that key.
    expect(isEdgeCacheable(new Request(`${spot}?data_candidate=d1&utm_source=x`))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul&utm_source=tiktok"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=atlantis&fbclid=1"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/?utm_source=newsletter"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/sign-up?redirect_url=%2Fusers%2Fx&utm_source=x"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/itineraries/preview?payment=success&utm_source=x"))).toBe(false);
    // Lookalike keys are not tracking keys.
    expect(withoutTracking(new URL("https://www.localley.io/?utm=x&sid=1&utm_source=a")).search).toBe("?utm=x&sid=1");
    expect(withoutTracking(new URL("https://www.localley.io/spots?city=seoul&gclid=1")).search).toBe("?city=seoul");
  });

  it("renders a cacheable /spots city page from the cleaned URL, so a tracking value never lands in shared HTML", async () => {
    const cache = memoryCache();
    const handler = vi.fn(async (request: Request) => new Response(`<html>${new URL(request.url).search}</html>`, {
      status: 200, headers: { "content-type": "text/html" },
    }));
    const miss = await serve(new Request("https://www.localley.io/spots?city=seoul&utm_source=tiktok&ttclid=T"), cache, handler);
    expect(await miss.text()).toBe("<html>?city=seoul</html>");
    const hit = await serve(new Request("https://www.localley.io/spots?city=seoul"), cache, handler);
    expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps one entry per enabled city and view on /spots", async () => {
    const cache = memoryCache();
    const handler = vi.fn(async (request: Request) => new Response(`<html>${new URL(request.url).search}</html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    await serve(new Request("https://www.localley.io/spots?city=seoul"), cache, handler);
    await serve(new Request("https://www.localley.io/spots?city=tokyo"), cache, handler);
    await serve(new Request("https://www.localley.io/spots?city=seoul&view=map"), cache, handler);
    const map = await serve(new Request("https://www.localley.io/spots?view=map&city=seoul"), cache, handler);
    expect(map.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await map.text()).toBe("<html>?city=seoul&view=map</html>");
    const seoul = await serve(new Request("https://www.localley.io/spots?city=seoul"), cache, handler);
    expect(seoul.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await seoul.text()).toBe("<html>?city=seoul</html>");
    expect(handler).toHaveBeenCalledTimes(3);
    expect([...cache.store.keys()]).toEqual([
      "https://www.localley.io/spots?__edge=v1&city=seoul",
      "https://www.localley.io/spots?__edge=v1&city=tokyo",
      "https://www.localley.io/spots?__edge=v1&city=seoul&view=map",
    ]);
  });

  it("serves every planner query from one plain-path entry and never renders a query into it", async () => {
    const cache = memoryCache();
    const handler = vi.fn(async (request: Request) => new Response(`<html>${new URL(request.url).search}</html>`, {
      status: 200,
      headers: { "content-type": "text/html", "cache-control": "private, no-store" },
    }));
    const spot = "https://www.localley.io/itineraries/new?spot=043c722d-c213-448e-a448-9179d37506a8&city=Tokyo";
    const first = await serve(new Request(spot), cache, handler);
    expect(first.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    expect(await first.text()).toBe("<html></html>");
    expect(new URL(handler.mock.calls[0][0].url).search).toBe("");
    for (const query of ["", "?city=Seoul", "?resume=1", "?template=x&days=3", "?utm_source=tiktok"]) {
      const hit = await serve(new Request(`https://www.localley.io/itineraries/new${query}`), cache, handler);
      expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
      expect(hit.headers.get("cache-control")).toBe("private, no-store");
      expect(await hit.text()).toBe("<html></html>");
    }
    expect(handler).toHaveBeenCalledTimes(1);
    expect([...cache.store.keys()]).toEqual(["https://www.localley.io/itineraries/new?__edge=v1"]);
    const rsc = await serve(new Request(spot, { headers: { rsc: "1" } }), cache, handler);
    expect(rsc.headers.get(EDGE_CACHE_HEADER)).toBeNull();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("caches only the planner's public city list as JSON, for five minutes", async () => {
    const cache = memoryCache();
    const json = () => new Response('{"success":true,"cities":[]}', { status: 200, headers: { "content-type": "application/json" } });
    const handler = vi.fn(async () => json());
    const url = "https://www.localley.io/api/cities?minSpots=1";
    expect((await serve(new Request(url), cache, handler)).headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    const hit = await serve(new Request(url), cache, handler);
    expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await hit.text()).toBe('{"success":true,"cities":[]}');
    expect(handler).toHaveBeenCalledTimes(1);
    expect([...cache.store.values()][0].headers.get("cache-control")).toBe(`public, s-maxage=${300 + EDGE_STALE_SECONDS}`);
    for (const other of ["/api/cities", "/api/cities?minSpots=0", "/api/cities?minSpots=1&data_candidate=d1", "/api/cities?minSpots=1&noCache=true", "/api/conditions"]) {
      expect(isEdgeCacheable(new Request(`https://www.localley.io${other}`)), other).toBe(false);
    }
  });

  it("never stores a city list that is not JSON, failed or sets a cookie", async () => {
    for (const response of [
      new Response("<html>", { headers: { "content-type": "text/html" } }),
      new Response("{}", { status: 500, headers: { "content-type": "application/json" } }),
      new Response("{}", { headers: { "content-type": "application/json", "set-cookie": "a=1" } }),
    ]) {
      const cache = memoryCache();
      await serve(new Request("https://www.localley.io/api/cities?minSpots=1"), cache, async () => response);
      expect(cache.put).not.toHaveBeenCalled();
    }
  });

  it("caches the map pin index per enabled city and each pin card, for five minutes", async () => {
    const cache = memoryCache();
    const json = () => new Response('{"v":1}', { status: 200, headers: { "content-type": "application/json" } });
    const handler = vi.fn(async () => json());
    for (const url of ["/api/spots/pins", "/api/spots/pins?city=tokyo", "/api/spots/pins/0a1b2c3d"]) {
      const full = `https://www.localley.io${url}`;
      expect((await serve(new Request(full), cache, handler)).headers.get(EDGE_CACHE_HEADER), url).toBe("MISS");
      expect((await serve(new Request(full), cache, handler)).headers.get(EDGE_CACHE_HEADER), url).toBe("HIT");
    }
    expect(handler).toHaveBeenCalledTimes(3);
    for (const other of [
      "/api/spots/pins?city=atlantis",
      "/api/spots/pins?search=noodles",
      "/api/spots/pins?city=tokyo&category=Food",
      "/api/spots/pins/short",
      "/api/spots/pins/../admin",
      "/api/spots/pins/0A1B2C3D",
    ]) {
      expect(isEdgeCacheable(new Request(`https://www.localley.io${other}`)), other).toBe(false);
    }
  });

  it("keeps viral events and pin cards at five minutes while spot pages get one hour", () => {
    expect(edgeTtlSeconds("/spots/15614d97-380f-4e8d-8aa6-aa6f43609bcf")).toBe(3600);
    expect(edgeTtlSeconds("/trending/songkran-water-fight")).toBe(300);
    expect(edgeTtlSeconds("/credits/seoul")).toBe(3600);
    expect(edgeTtlSeconds("/credits/ho-chi-minh-city")).toBe(3600);
    expect(edgeTtlSeconds("/credits/Seoul")).toBeUndefined();
    expect(edgeTtlSeconds("/credits/seoul/x")).toBeUndefined();
    // Push CB2: the city A-Z list page.
    expect(edgeTtlSeconds("/spots/a-z/seoul")).toBe(3600);
    expect(edgeTtlSeconds("/spots/a-z/hong-kong")).toBe(3600);
    expect(edgeTtlSeconds("/spots/a-z/Seoul")).toBeUndefined();
    expect(edgeTtlSeconds("/spots/a-z/seoul/x")).toBeUndefined();
    expect(edgeTtlSeconds("/api/spots/pins/15614d97")).toBe(300);
    expect(edgeTtlSeconds("/spots/15614d97-380f-4e8d-8aa6-aa6f43609bcf/edit")).toBeUndefined();
  });
});

describe("auth pages on the money-path redirects", () => {
  const origin = "https://www.localley.io";
  const moneyRedirects = [
    GENERATED_PREVIEW_PATH,
    `${GENERATED_PREVIEW_PATH}?continue=save`,
    PLANNER_RESUME_PATH,
    ...(["pro", "premium"] as const).flatMap((tier) => (["monthly", "yearly"] as const).map((cycle) =>
      new URL(checkoutSignUpUrl(tier, cycle), origin).searchParams.get("redirect_url")!)),
  ];

  it("lists the redirect the preview Save button really sends (Push BH4)", () => {
    const client = readFileSync("app/itineraries/preview/preview-client.tsx", "utf8");
    expect(client).toContain("/sign-up?redirect_url=${encodeURIComponent(`${GENERATED_PREVIEW_PATH}?continue=save`)}");
    expect(EDGE_AUTH_REDIRECTS.has(`${GENERATED_PREVIEW_PATH}?continue=save`)).toBe(true);
    expect(isEdgeCacheable(new Request(`${origin}/sign-up?redirect_url=${encodeURIComponent(`${GENERATED_PREVIEW_PATH}?continue=save`)}`))).toBe(true);
    expect(isEdgeCacheable(new Request(`${origin}/sign-up?redirect_url=${encodeURIComponent(`${GENERATED_PREVIEW_PATH}?continue=edit`)}`))).toBe(false);
  });

  it("lists exactly the redirects the app sends to sign-up", () => {
    expect([...EDGE_AUTH_REDIRECTS].sort()).toEqual([...moneyRedirects].sort());
  });

  it("caches each money redirect under its own key and nothing else", async () => {
    const cache = memoryCache();
    for (const path of ["/sign-up", "/sign-in"]) {
      for (const redirect of moneyRedirects) {
        const url = `${origin}${path}?redirect_url=${encodeURIComponent(redirect)}`;
        expect(isEdgeCacheable(new Request(url))).toBe(true);
        const handler = vi.fn(async () => new Response(`<html>${path} ${redirect}</html>`, { status: 200, headers: { "content-type": "text/html" } }));
        expect((await serve(new Request(url), cache, handler)).headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
        const hit = await serve(new Request(url), cache, handler);
        expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
        expect(await hit.text()).toBe(`<html>${path} ${redirect}</html>`);
        expect(handler).toHaveBeenCalledTimes(1);
      }
    }
    expect(cache.store.size).toBe(2 * moneyRedirects.length);
    for (const search of [
      "?redirect_url=%2Fusers%2Fx",
      "?redirect_url=%2Fpricing%3Fcheckout%3Dgold-monthly",
      "?redirect_url=%2F%2Fevil.example%2Fitineraries%2Fpreview",
      "?redirect_url=%2Fitineraries%2Fpreview&redirect_url=%2Fdashboard",
      "?redirect_url=%2Fitineraries%2Fpreview&utm=x",
      "?next=%2Fitineraries%2Fpreview",
    ]) {
      expect(isEdgeCacheable(new Request(`${origin}/sign-up${search}`))).toBe(false);
    }
    expect(isEdgeCacheable(new Request(`${origin}/forgot-password?redirect_url=%2Fitineraries%2Fpreview`))).toBe(false);
    expect(isEdgeCacheable(new Request(`${origin}/pricing?redirect_url=%2Fitineraries%2Fpreview`))).toBe(false);
  });
});

describe("per-visitor preview draft", () => {
  const url = "https://www.localley.io/itineraries/preview";
  const withDraft = (cookie = "lly_draft=131f863a-7371-4924-aeda-a93a6528d7bf") => new Request(url, { headers: { cookie: `theme=dark; ${cookie}` } });
  const render = vi.fn(async (request: Request) => new Response(
    request.headers.get("cookie")?.includes("lly_draft=1") ? "<html>MY TRIP</html>" : "<html>empty</html>",
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  ));

  it("never stores a draft holder's page and never serves the shared page to a draft holder", async () => {
    const cache = memoryCache();
    const mine = await serve(withDraft(), cache, render);
    expect(await mine.text()).toBe("<html>MY TRIP</html>");
    expect(mine.headers.get(EDGE_CACHE_HEADER)).toBeNull();
    expect(cache.put).not.toHaveBeenCalled();
    const other = await serve(new Request(url), cache, render);
    expect(await other.text()).toBe("<html>empty</html>");
    expect(other.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    expect((await serve(new Request(url), cache, render)).headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    const againMine = await serve(withDraft(), cache, render);
    expect(await againMine.text()).toBe("<html>MY TRIP</html>");
    expect(cache.match).toHaveBeenCalledTimes(2);
  });

  it("bypasses only for a non-empty draft cookie on the preview path", () => {
    expect(isEdgeCacheable(withDraft())).toBe(false);
    expect(isEdgeCacheable(withDraft("lly_draft="))).toBe(true);
    expect(isEdgeCacheable(withDraft("xlly_draft=1"))).toBe(true);
    expect(isEdgeCacheable(new Request("https://www.localley.io/", { headers: { cookie: "lly_draft=1" } }))).toBe(true);
  });
});

describe("per-spot share card at the edge", () => {
  const og = "https://www.localley.io/spots/f242e187-56ee-4cc8-9736-52f4ea46aebc/og";
  it("caches the PNG for a week and only for the exact path", () => {
    expect(edgeTtlSeconds(new URL(og).pathname)).toBe(604800);
    expect(isEdgeCacheable(new Request(og))).toBe(true);
    expect(isEdgeCacheable(new Request(`${og}?v=2`))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/not-a-uuid/og"))).toBe(false);
  });

  it("stores a PNG but never HTML or an error on the card path", async () => {
    const cache = memoryCache();
    const png = vi.fn(async () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { "content-type": "image/png" } }));
    await serve(new Request(og), cache, png);
    expect((await serve(new Request(og), cache, png)).headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(png).toHaveBeenCalledTimes(1);
    const other = memoryCache();
    await serve(new Request(og), other, async () => html());
    await serve(new Request(og), other, async () => new Response("x", { status: 404, headers: { "content-type": "image/png" } }));
    expect(other.put).not.toHaveBeenCalled();
  });
});

describe("stored spot photos at the edge (hero LCP)", () => {
  const base = "https://www.localley.io/media/spot/01053a4b-458b-4377-bf9d-2b70837b006e/" + "a".repeat(64);
  const webp = (cacheControl: string, status = 200) => vi.fn(async () => new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46]), {
    status, headers: { "content-type": "image/webp", "cache-control": cacheControl },
  }));
  const immutable = "public, max-age=31536000, immutable";

  it("caches the full photo and its size copies for a week, exact path only", () => {
    for (const suffix of ["", "-w960", "-w480", "-w144"]) {
      expect(edgeTtlSeconds(new URL(`${base}${suffix}.webp`).pathname)).toBe(604800);
      expect(isEdgeCacheable(new Request(`${base}${suffix}.webp`))).toBe(true);
    }
    expect(isEdgeCacheable(new Request(`${base}.webp?v=2`))).toBe(false);
    expect(isEdgeCacheable(new Request(`${base}-480.webp`))).toBe(false);
    expect(isEdgeCacheable(new Request(`${base}.jpg`))).toBe(false);
    expect(isEdgeCacheable(new Request(`${base}.webp`, { method: "HEAD" }))).toBe(false);
  });

  it("serves a hit across deploys: the key has no Worker version", async () => {
    const cache = memoryCache();
    const origin = webp(immutable);
    expect((await serve(new Request(`${base}-w480.webp`), cache, origin, "v1")).headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    const hit = await serve(new Request(`${base}-w480.webp`), cache, origin, "v2");
    expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(hit.headers.get("cache-control")).toBe(immutable);
    expect(hit.headers.get("content-type")).toBe("image/webp");
    expect(origin).toHaveBeenCalledTimes(1);
    expect([...cache.store.keys()]).toEqual([`${base}-w480.webp`]);
  });

  it("never stores a stand-in copy, a 404, a cookie answer or a non-webp body", async () => {
    const cache = memoryCache();
    await serve(new Request(`${base}-w144.webp`), cache, webp("public, max-age=3600"));
    await serve(new Request(`${base}.webp`), cache, webp("no-store", 404));
    await serve(new Request(`${base}.webp`), cache, async () => new Response("x", { headers: { "content-type": "image/webp", "cache-control": immutable, "set-cookie": "a=1" } }));
    await serve(new Request(`${base}.webp`), cache, async () => html({ "cache-control": immutable }));
    expect(cache.put).not.toHaveBeenCalled();
  });
});

describe("unknown paths share one 404 entry (Push AM5)", () => {
  const notFound = (headers: Record<string, string> = {}) => vi.fn(async () => new Response("<html>404</html>", {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate", ...headers },
  }));

  it("lists exactly the top-level names under app/, so no route is mistaken for an unknown path", () => {
    expect([...APP_TOP_LEVEL_NAMES].sort()).toEqual(readdirSync("app").sort());
  });

  it("renders the 404 once, then serves every unknown path from the same entry with status 404", async () => {
    const cache = memoryCache();
    const handler = notFound();
    const first = await serve(new Request("https://www.localley.io/nope-xyz"), cache, handler);
    expect(first.status).toBe(404);
    expect(first.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    expect(await first.text()).toBe("<html>404</html>");
    for (const path of ["/nope-xyz", "/wp-login.php", "/cities/seoul", "/a/b/c"]) {
      const hit = await serve(new Request(`https://www.localley.io${path}`), cache, handler);
      expect(hit.status).toBe(404);
      expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
      expect(hit.headers.get("cache-control")).toBe("private, no-cache, no-store, max-age=0, must-revalidate");
      expect(hit.headers.has("x-localley-origin-status")).toBe(false);
      expect(await hit.text()).toBe("<html>404</html>");
    }
    expect(handler).toHaveBeenCalledTimes(1);
    expect([...cache.store.keys()]).toEqual(["https://www.localley.io/__not-found?__edge=v1"]);
  });

  it("re-renders after a deploy (the key carries the version)", async () => {
    const cache = memoryCache();
    const handler = notFound();
    await serve(new Request("https://www.localley.io/nope"), cache, handler, "v1");
    await serve(new Request("https://www.localley.io/nope"), cache, handler, "v2");
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("never stores a non-404, a cookie answer or a non-HTML body", async () => {
    const cache = memoryCache();
    await serve(new Request("https://www.localley.io/nope"), cache, async () => html());
    await serve(new Request("https://www.localley.io/nope"), cache, notFound({ "set-cookie": "a=1" }));
    await serve(new Request("https://www.localley.io/nope"), cache, notFound({ "content-type": "application/json" }));
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("leaves app routes, queries, the apex host, sessions, framework paths, RSC and non-GET to the Worker", () => {
    const req = (url: string, init?: RequestInit) => new Request(url, init);
    expect(isUnknownPagePath(req("https://www.localley.io/nope-xyz"))).toBe(true);
    for (const request of [
      req("https://www.localley.io/"),
      req("https://www.localley.io/spots/nope"),
      req("https://www.localley.io/dashboard"),
      req("https://www.localley.io/blog/x"),
      req("https://www.localley.io/nope?error=TOKEN_EXPIRED"),
      req("https://localley.io/nope"),
      req("https://localley.nkopp.workers.dev/nope"),
      req("https://www.localley.io/nope", { headers: { cookie: "__Secure-better-auth.session_token=abc.def" } }),
      req("https://www.localley.io/_next/static/x.js"),
      req("https://www.localley.io/cdn-cgi/trace"),
      req("https://www.localley.io/.well-known/x"),
      req("https://www.localley.io/nope", { headers: { rsc: "1" } }),
      req("https://www.localley.io/nope", { method: "POST" }),
    ]) {
      expect(isUnknownPagePath(request), request.url).toBe(false);
    }
    expect(isUnknownPagePath(req("https://www.localley.io/nope", { headers: { cookie: "theme=dark" } }))).toBe(true);
  });
});

describe("stale-while-revalidate (Push AW1)", () => {
  const spot = "https://www.localley.io/spots/0022dc9c-5f13-41fd-9940-38a190795704";
  const page = (body: string) => async () => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

  it("serves a fresh copy as HIT, an expired copy at once as STALE, and stores one background render", async () => {
    const cache = memoryCache();
    let clock = 1_000_000;
    const now = () => clock;
    let n = 0;
    const handler = vi.fn(async () => page(`<html>v${++n}</html>`)());
    const first = await serve(new Request(spot), cache, handler, "v1", now);
    expect(first.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
    clock += 3599_000;
    const fresh = await serve(new Request(spot), cache, handler, "v1", now);
    expect(fresh.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(fresh.headers.has("x-localley-stored-at")).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    clock += 2_000;
    const stale = await serve(new Request(spot), cache, handler, "v1", now);
    expect(stale.headers.get(EDGE_CACHE_HEADER)).toBe("STALE");
    expect(await stale.text()).toBe("<html>v1</html>");
    expect(handler).toHaveBeenCalledTimes(2);
    const after = await serve(new Request(spot), cache, handler, "v1", now);
    expect(after.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await after.text()).toBe("<html>v2</html>");
    expect(handler).toHaveBeenCalledTimes(2);
    expect(cache.store.size).toBe(1);
  });

  it("drops the stale copy when the page is gone, and a new version never reads the old copy", async () => {
    const cache = memoryCache();
    let clock = 1_000_000;
    const now = () => clock;
    const handler = vi.fn(async () => page("<html>spot</html>")());
    await serve(new Request(spot), cache, handler, "v1", now);
    clock += 3601_000;
    const gone = vi.fn(async () => new Response("missing", { status: 404, headers: { "content-type": "text/html" } }));
    expect((await serve(new Request(spot), cache, gone, "v1", now)).headers.get(EDGE_CACHE_HEADER)).toBe("STALE");
    expect(gone).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(0);
    expect((await serve(new Request(spot), cache, gone, "v1", now)).status).toBe(404);
    await serve(new Request(spot), cache, handler, "v1", now);
    const next = await serve(new Request(spot), cache, handler, "v2", now);
    expect(next.headers.get(EDGE_CACHE_HEADER)).toBe("MISS");
  });

  it("keeps entries without a stored time (written before this change) as plain hits", async () => {
    const cache = memoryCache();
    cache.store.set(`${spot}?__edge=v1`, new Response("<html>old</html>", { headers: { "content-type": "text/html" } }));
    const handler = vi.fn(async () => page("<html>new</html>")());
    const res = await serve(new Request(spot), cache, handler, "v1", () => 9e15);
    expect(res.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(handler).not.toHaveBeenCalled();
  });

  it("refreshes a tracking-query visit under the plain URL", async () => {
    const cache = memoryCache();
    let clock = 1_000_000;
    const seen: string[] = [];
    const handler = vi.fn(async (r: Request) => { seen.push(r.url); return page("<html>s</html>")(); });
    await serve(new Request(spot), cache, handler, "v1", () => clock);
    clock += 3601_000;
    expect((await serve(new Request(`${spot}?utm_source=tiktok&ttclid=abc`), cache, handler, "v1", () => clock)).headers.get(EDGE_CACHE_HEADER)).toBe("STALE");
    expect(seen).toEqual([spot, spot]);
    expect(cache.store.size).toBe(1);
  });
});

describe("auth pages on the signed-out walls (Push BC3)", () => {
  const origin = "https://www.localley.io";
  it("caches each wall and email-link redirect under its own key, never a query or sub-path variant", async () => {
    const cache = memoryCache();
    for (const path of ["/sign-up", "/sign-in"]) {
      for (const redirect of EDGE_AUTH_WALL_REDIRECTS) {
        const url = `${origin}${path}?redirect_url=${encodeURIComponent(redirect)}`;
        expect(isEdgeCacheable(new Request(url))).toBe(true);
        const handler = vi.fn(async () => new Response(`<html>${path} ${redirect}</html>`, { status: 200, headers: { "content-type": "text/html" } }));
        await serve(new Request(url), cache, handler);
        const hit = await serve(new Request(url), cache, handler);
        expect(hit.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
        expect(await hit.text()).toBe(`<html>${path} ${redirect}</html>`);
        expect(handler).toHaveBeenCalledTimes(1);
        // A session still skips the cache: the page forwards a signed-in visitor (Push BB1).
        expect(isEdgeCacheable(new Request(url, { headers: { cookie: "__Secure-better-auth.session_token=t.s" } }))).toBe(false);
      }
    }
    expect(cache.store.size).toBe(2 * EDGE_AUTH_WALL_REDIRECTS.size);
    for (const redirect of ["/community/abc", "/users/x", "/leaderboard?tab=week", "/explore/", "/settings/billing"]) {
      expect(isEdgeCacheable(new Request(`${origin}/sign-up?redirect_url=${encodeURIComponent(redirect)}`))).toBe(false);
    }
  });

  it("caches the bottom-nav tab walls too (Push BG2)", () => {
    for (const redirect of ["/chat", "/itineraries", "/profile"]) {
      expect(EDGE_AUTH_WALL_REDIRECTS.has(redirect)).toBe(true);
      expect(isEdgeCacheable(new Request(`${origin}/sign-up?redirect_url=${encodeURIComponent(redirect)}`))).toBe(true);
    }
    for (const redirect of ["/chat/abc", "/itineraries/123", "/profile?tab=x"]) {
      expect(isEdgeCacheable(new Request(`${origin}/sign-up?redirect_url=${encodeURIComponent(redirect)}`))).toBe(false);
    }
  });

  it("lists only redirects with their own fixed heading (no visitor data in the cached HTML)", () => {
    for (const redirect of EDGE_AUTH_WALL_REDIRECTS) {
      for (const mode of ["sign-up", "sign-in"] as const) {
        expect(authCopy(mode, redirect).title).not.toBe(authCopy(mode, null).title);
      }
    }
  });
});

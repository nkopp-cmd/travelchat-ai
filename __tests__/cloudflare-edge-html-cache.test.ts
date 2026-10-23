import { describe, expect, it, vi } from "vitest";
import { EDGE_CACHE_HEADER, isEdgeCacheable, serveWithEdgeCache } from "@/cloudflare/opennext/edge-html-cache";

function memoryCache() {
  const store = new Map<string, Response>();
  return {
    store,
    match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => { store.set(request.url, response); }),
  };
}

const html = (headers: Record<string, string> = {}) => new Response("<html>home</html>", {
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8", "cache-control": "s-maxage=31536000", ...headers },
});

async function serve(request: Request, cache: ReturnType<typeof memoryCache>, handler: (r: Request) => Promise<Response>, version: string | undefined = "v1") {
  const pending: Promise<unknown>[] = [];
  const response = await serveWithEdgeCache(request, version, cache, (p) => pending.push(p), handler);
  await Promise.all(pending);
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
    expect(stored.find(([url]) => url.includes("/spots?"))?.[1].headers.get("cache-control")).toBe("public, s-maxage=300");
    expect(stored.find(([url]) => url.startsWith("https://www.localley.io/?"))?.[1].headers.get("cache-control")).toBe("public, s-maxage=86400");
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

  it("bypasses the cache for other routes, queries, methods, RSC requests and missing versions", async () => {
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots/abc"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul"))).toBe(true);
    for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) {
      expect(isEdgeCacheable(new Request(`https://www.localley.io${path}`))).toBe(true);
      expect(isEdgeCacheable(new Request(`https://www.localley.io${path}?redirect_url=%2Fdashboard`))).toBe(false);
    }
    expect(isEdgeCacheable(new Request("https://www.localley.io/reset-password"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=atlantis"))).toBe(false);
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots?city=seoul&category=Food"))).toBe(false);
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

  it("keeps one entry per enabled city on /spots", async () => {
    const cache = memoryCache();
    const handler = vi.fn(async (request: Request) => new Response(`<html>${new URL(request.url).search}</html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    }));
    await serve(new Request("https://www.localley.io/spots?city=seoul"), cache, handler);
    await serve(new Request("https://www.localley.io/spots?city=tokyo"), cache, handler);
    const seoul = await serve(new Request("https://www.localley.io/spots?city=seoul"), cache, handler);
    expect(seoul.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(await seoul.text()).toBe("<html>?city=seoul</html>");
    expect(handler).toHaveBeenCalledTimes(2);
    expect([...cache.store.keys()]).toEqual([
      "https://www.localley.io/spots?__edge=v1&city=seoul",
      "https://www.localley.io/spots?__edge=v1&city=tokyo",
    ]);
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
    expect([...cache.store.values()][0].headers.get("cache-control")).toBe("public, s-maxage=300");
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
});

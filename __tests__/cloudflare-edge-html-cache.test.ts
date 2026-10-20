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

  it("never stores responses that set cookies, fail, or are not HTML", async () => {
    for (const response of [html({ "set-cookie": "a=1" }), new Response("x", { status: 500, headers: { "content-type": "text/html" } }), new Response("{}", { headers: { "content-type": "application/json" } })]) {
      const cache = memoryCache();
      await serve(new Request("https://www.localley.io/"), cache, async () => response);
      expect(cache.put).not.toHaveBeenCalled();
    }
  });

  it("bypasses the cache for other routes, queries, methods, RSC requests and missing versions", async () => {
    expect(isEdgeCacheable(new Request("https://www.localley.io/spots"))).toBe(false);
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
});

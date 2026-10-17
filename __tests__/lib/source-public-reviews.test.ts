import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readProductionReviewsForPreview } from "@/lib/source-public-reviews";
const id = "00000000-0000-4000-8000-000000000009";
const body = { reviews: [], total: 0, averageRating: 0, ratingDistribution: [0,0,0,0,0] };
const request = (query = "", host = "localley-next-preview.nkopp.workers.dev") => new NextRequest(`https://${host}/api/spots/${id}/reviews${query}`, {
  headers: { Cookie: "private-preview-cookie", Authorization: "private-preview-bearer", "Cloudflare-Workers-Version-Overrides": "private-preview-version" },
});
afterEach(() => vi.unstubAllGlobals());
describe("normal preview public review projection", () => {
  it("uses a fixed public production URL and never forwards identity or version headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body))); vi.stubGlobal("fetch", fetcher);
    const response = await readProductionReviewsForPreview(request("?sort=helpful&limit=10&offset=2&ignored=secret"), id);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(body); expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, options] = fetcher.mock.calls[0]; expect(String(url)).toBe(`https://www.localley.io/api/spots/${id}/reviews?sort=helpful&limit=10&offset=2`);
    expect(options.headers).toEqual({ Accept: "application/json" }); expect(options.method).toBe("GET"); expect(options.redirect).toBe("error"); expect(options.cache).toBe("no-store"); expect(options.credentials).toBe("omit");
  });
  it.each(["www.localley.io", "attacker.test"])("refuses a foreign host without a fetch: %s", async host => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect((await readProductionReviewsForPreview(request("", host), id)).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["?app_data=d1", "?app_data=unknown"])("never provides Source fallback for explicit candidate routing: %s", async query => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect((await readProductionReviewsForPreview(request(query), id)).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["?limit=0", "?limit=101", "?offset=-1", "?offset=10001", "?sort=unknown"])("bounds untrusted queries: %s", async query => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect((await readProductionReviewsForPreview(request(query), id)).status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not follow an invalid ID to another resource", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); expect((await readProductionReviewsForPreview(request(), "../subscription/checkout")).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on upstream errors, oversized replies and malformed shapes", async () => {
    for (const response of [new Response("private upstream error", {status:500}), new Response("x".repeat(524289)), new Response("not-json"), new Response(JSON.stringify({...body,total:-1}))]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response)); const r = await readProductionReviewsForPreview(request(), id); expect(r.status).toBe(503); expect(JSON.stringify(await r.json())).not.toContain("private upstream error");
    }
  });
});

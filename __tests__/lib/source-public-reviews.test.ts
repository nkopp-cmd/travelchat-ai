import { readFileSync } from "node:fs";
import { parse } from "json5";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readProductionReviewsForPreview } from "@/lib/source-public-reviews";
const id = "00000000-0000-4000-8000-000000000009";
const body = { reviews: [], total: 0, averageRating: 0, ratingDistribution: [0,0,0,0,0] };
const request = (query = "", host = "localley-next-preview.nkopp.workers.dev") => new NextRequest(`https://${host}/api/spots/${id}/reviews${query}`, {
  headers: { Cookie: "private-preview-cookie", Authorization: "private-preview-bearer", "Cloudflare-Workers-Version-Overrides": "private-preview-version" },
});
const binding = (fetcher: ReturnType<typeof vi.fn>) => vi.stubGlobal(Symbol.for("__cloudflare-context__"), { env: { PUBLIC_REVIEW_SOURCE: { fetch: fetcher } } });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Public-network fallback forbidden"))); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("normal preview public review projection", () => {
  it("uses the service binding with a fixed public URL and never forwards identity or version headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(body))); binding(fetcher);
    const response = await readProductionReviewsForPreview(request("?sort=helpful&limit=10&offset=2&ignored=secret"), id);
    expect(response.status).toBe(200); expect(await response.json()).toEqual(body); expect(response.headers.get("cache-control")).toBe("no-store");
    const [url, options] = fetcher.mock.calls[0]; expect(String(url)).toBe(`https://www.localley.io/api/spots/${id}/reviews?sort=helpful&limit=10&offset=2`);
    expect(options.headers).toEqual({ Accept: "application/json" }); expect(options.method).toBe("GET"); expect(options.redirect).toBe("error"); expect(options.cache).toBe("no-store"); expect(options.credentials).toBe("omit"); expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("adds only a preview service binding and keeps production services explicit", () => {
    const config = parse(readFileSync("wrangler.jsonc", "utf8"));
    expect(config.services).toContainEqual({ binding: "PUBLIC_REVIEW_SOURCE", service: "localley-next" });
    expect(config.env.production.services).toEqual([{ binding: "WORKER_SELF_REFERENCE", service: "localley-next" }]);
  });
  it("logs only a bounded failure label when a binding throws", async () => {
    binding(vi.fn().mockRejectedValue(new Error("private-upstream-credentials")));
    expect((await readProductionReviewsForPreview(request(), id)).status).toBe(503);
    expect(console.warn).toHaveBeenCalledWith("[PUBLIC_REVIEW_PROJECTION]", { reason: "upstream_exception" });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("private-upstream-credentials");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("refuses missing bindings without a public-network fallback", async () => {
    vi.stubGlobal(Symbol.for("__cloudflare-context__"), { env: {} });
    expect((await readProductionReviewsForPreview(request(), id)).status).toBe(503);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith("[PUBLIC_REVIEW_PROJECTION]", { reason: "binding_missing" });
  });
  it.each(["www.localley.io", "attacker.test"])("refuses a foreign host without a fetch: %s", async host => {
    const fetcher = vi.fn(); binding(fetcher); expect((await readProductionReviewsForPreview(request("", host), id)).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["?app_data=d1", "?app_data=unknown", "?data_candidate=d1", "?data_candidate=unknown"])("never provides Source fallback for explicit candidate routing: %s", async query => {
    const fetcher = vi.fn(); binding(fetcher); expect((await readProductionReviewsForPreview(request(query), id)).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["?limit=0", "?limit=101", "?offset=-1", "?offset=10001", "?sort=unknown"])("bounds untrusted queries: %s", async query => {
    const fetcher = vi.fn(); binding(fetcher); expect((await readProductionReviewsForPreview(request(query), id)).status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not follow an invalid ID to another resource", async () => {
    const fetcher = vi.fn(); binding(fetcher); expect((await readProductionReviewsForPreview(request(), "../subscription/checkout")).status).toBe(503); expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on upstream errors, oversized replies and malformed shapes", async () => {
    for (const response of [new Response("private upstream error", {status:500}), new Response("x".repeat(524289)), new Response("not-json"), new Response(JSON.stringify({...body,total:-1}))]) {
      binding(vi.fn().mockResolvedValue(response)); const r = await readProductionReviewsForPreview(request(), id); expect(r.status).toBe(503); expect(JSON.stringify(await r.json())).not.toContain("private upstream error");
    }
  });
});

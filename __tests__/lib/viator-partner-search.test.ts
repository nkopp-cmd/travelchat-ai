import { afterEach, describe, expect, it, vi } from "vitest";

// The client called GET /partner/search (not a Viator endpoint) and always fell back. The real call is
// POST /partner/products/search with a destination id, exp-api-key and a versioned Accept header.
async function loadClient() {
    vi.resetModules();
    return import("@/lib/viator");
}

const product = {
    productCode: "12345P1",
    title: "Gwangjang Market night food tour",
    description: "Eat your way through the market.",
    images: [{ variants: [
        { url: "https://hare-media-cdn.tripadvisor.com/media/a-150.jpg", width: 150, height: 150 },
        { url: "https://hare-media-cdn.tripadvisor.com/media/a-720.jpg", width: 720, height: 480 },
        { url: "https://hare-media-cdn.tripadvisor.com/media/a-2000.jpg", width: 2000, height: 1300 },
    ] }],
    reviews: { totalReviews: 812, combinedAverageRating: 4.8 },
    duration: { fixedDurationInMinutes: 180 },
    pricing: { summary: { fromPrice: 69 }, currency: "USD" },
    productUrl: "https://www.viator.com/tours/Seoul/Night-food/d973-12345P1?mcid=42383&pid=P00012345&medium=api",
    flags: ["FREE_CANCELLATION"],
};

describe("Viator Partner API search", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("posts to /products/search with the destination id and v2 headers, and keeps the partner URL", async () => {
        vi.stubEnv("VIATOR_ALLOW_MOCK", "");
        const fetchMock = vi.fn(async () => Response.json({ products: [product], totalCount: 1 }));
        vi.stubGlobal("fetch", fetchMock);
        const { default: ViatorClient, clearViatorSearchCache } = await loadClient();
        clearViatorSearchCache();
        const client = new ViatorClient({ apiKey: "k", baseUrl: "https://api.viator.com/partner" });

        const result = await client.searchActivities({ destination: "Seoul", limit: 4 });

        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://api.viator.com/partner/products/search");
        expect(init.method).toBe("POST");
        const headers = init.headers as Record<string, string>;
        expect(headers["exp-api-key"]).toBe("k");
        expect(headers.Accept).toBe("application/json;version=2.0");
        const body = JSON.parse(String(init.body));
        expect(body.filtering.destination).toBe("973");
        expect(body.pagination).toEqual({ start: 1, count: 4 });

        expect(result.activities).toHaveLength(1);
        const a = result.activities[0];
        expect(a.bookingUrl).toContain("pid=P00012345");
        expect(a.viatorUrl).toBe(product.productUrl);
        expect(a.thumbnailUrl).toBe("https://hare-media-cdn.tripadvisor.com/media/a-720.jpg");
        expect(a.rating).toBe(4.8);
        expect(a.priceFrom).toBe(69);
        expect(a.freeCancellation).toBe(true);
    });

    it("caches one search per city so repeat views do not call Viator again", async () => {
        vi.stubEnv("VIATOR_ALLOW_MOCK", "");
        const fetchMock = vi.fn(async () => Response.json({ products: [product], totalCount: 1 }));
        vi.stubGlobal("fetch", fetchMock);
        const { default: ViatorClient, clearViatorSearchCache } = await loadClient();
        clearViatorSearchCache();
        const client = new ViatorClient({ apiKey: "k" });
        await client.searchActivities({ destination: "Tokyo", limit: 4 });
        await client.searchActivities({ destination: "tokyo", limit: 4 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not call Viator for a city without a destination id", async () => {
        vi.stubEnv("VIATOR_ALLOW_MOCK", "");
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const { default: ViatorClient } = await loadClient();
        const client = new ViatorClient({ apiKey: "k" });
        const result = await client.searchActivities({ destination: "Atlantis", limit: 4 });
        expect(result.activities).toHaveLength(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("drops products without a partner URL and hides a rating with no reviews", async () => {
        vi.stubEnv("VIATOR_ALLOW_MOCK", "");
        const noUrl = { ...product, productCode: "X1", productUrl: undefined };
        const noReviews = { ...product, productCode: "X2", reviews: { totalReviews: 0, combinedAverageRating: 0 } };
        vi.stubGlobal("fetch", vi.fn(async () => Response.json({ products: [noUrl, noReviews], totalCount: 2 })));
        const { default: ViatorClient, clearViatorSearchCache } = await loadClient();
        clearViatorSearchCache();
        const client = new ViatorClient({ apiKey: "k" });
        const result = await client.searchActivities({ destination: "Bangkok", limit: 4 });
        expect(result.activities.map((a) => a.productCode)).toEqual(["X2"]);
        expect(result.activities[0].rating).toBeUndefined();
    });
});

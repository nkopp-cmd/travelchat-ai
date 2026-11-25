import { afterEach, describe, expect, it, vi } from "vitest";

// Invented tours (fake titles, prices, ratings, review counts) reached the live itinerary page because
// every Viator error fell back to mock data. Production must show nothing instead.
async function loadClient() {
    vi.resetModules();
    const mod = await import("@/lib/viator");
    return mod;
}

describe("Viator client never shows invented tours to visitors", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("returns no tours when the API key is missing", async () => {
        vi.stubEnv("VIATOR_API_KEY", "");
        vi.stubEnv("VIATOR_ALLOW_MOCK", "");
        const { default: ViatorClient } = await loadClient();
        const client = new ViatorClient({ apiKey: "" });
        const result = await client.searchActivities({ destination: "Seoul", limit: 4 });
        expect(result).toEqual({ activities: [], total: 0, hasMore: false });
        expect(await client.getActivity("SEL-FOOD-001")).toBeNull();
    });

    it("returns no tours when the partner API fails", async () => {
        vi.stubEnv("VIATOR_ALLOW_MOCK", "");
        vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
        const { default: ViatorClient } = await loadClient();
        const client = new ViatorClient({ apiKey: "test-key" });
        const result = await client.searchActivities({ destination: "Tokyo", limit: 4 });
        expect(result.activities).toHaveLength(0);
        expect(await client.getActivity("TYO-FOOD-001")).toBeNull();
    });

    it("keeps mock tours only behind the explicit dev opt-in", async () => {
        vi.stubEnv("VIATOR_ALLOW_MOCK", "1");
        const { default: ViatorClient } = await loadClient();
        const client = new ViatorClient({ apiKey: "" });
        const result = await client.searchActivities({ destination: "Seoul", limit: 4 });
        expect(result.activities.length).toBeGreaterThan(0);
    });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ d1SpotCardsByIds: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/spots/d1-queries", () => ({ d1SpotCardsByIds: mocks.d1SpotCardsByIds }));

const A = "6bff8713-ceaa-45f8-a8b8-3e39d4017b03", B = "15614d97-380f-4e8d-8aa6-aa6f43609bcf";
const feed = { version: 1, updatedAt: "2026-10-31T00:00:00Z", events: [{
  slug: "justin-bieber-seoul-2026-10", label: "Justin Bieber in Seoul, Oct 2026", person: "Justin Bieber", city: "Seoul", citySlug: "seoul",
  month: "2026-10", summary: null, firstSeen: "2026-10-23T00:00:00Z", lastSeen: "2026-10-30T00:00:00Z", articleCount: 2,
  sources: [{ title: "Bieber in Seoul", url: "https://www.mt.co.kr/a/1", publisher: "MoneyToday", date: "2026-10-23" }],
  spots: [{ spotId: A, note: "walked here" }, { spotId: B, note: null }],
}] };
const raw = (id: string) => ({ id, name: { en: `Spot ${id.slice(0, 4)}` }, description: { en: "" }, address: "1 Road, Jongno-gu, Seoul, South Korea", category: "Food",
  subcategories: [], location: null, localley_score: 5, local_percentage: 80, photos: [], tips: [], verified: true, trending_score: 0 });

async function load(get: (key: string) => unknown) {
  vi.resetModules();
  vi.stubEnv("DATA_BACKEND", "d1");
  const bucket = { get: vi.fn(async (key: string) => get(key)) };
  (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")] = { env: { COMMUNITY_MEDIA: bucket } };
  return { bucket, ...(await import("@/lib/viral/events")) };
}

describe("viral events reader", () => {
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[Symbol.for("__cloudflare-context__")];
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("reads R2 once per isolate window and keeps only visible spots", async () => {
    const { bucket, fetchViralSpots, fetchViralEvent } = await load((key) => key === "viral/events.json" ? { json: async () => feed } : null);
    mocks.d1SpotCardsByIds.mockResolvedValue([raw(A)]); // B is hidden: the visible-only query drops it
    const rail = await fetchViralSpots("seoul");
    expect(rail.map((item) => [item.spot.id, item.event.slug, item.note])).toEqual([[A, "justin-bieber-seoul-2026-10", "walked here"]]);
    expect(await fetchViralSpots("busan")).toEqual([]);
    const page = await fetchViralEvent("justin-bieber-seoul-2026-10");
    expect(page?.spots.map((item) => item.spot.id)).toEqual([A]);
    expect(await fetchViralEvent("unknown-event")).toBeNull();
    expect(await fetchViralEvent("../etc")).toBeNull();
    expect(bucket.get).toHaveBeenCalledTimes(1);
    expect(mocks.d1SpotCardsByIds).toHaveBeenCalledWith([A, B]);
  });

  it("hides the rail when the file is missing, broken or R2 fails", async () => {
    for (const get of [() => null, () => ({ json: async () => ({ nope: true }) }), () => { throw new Error("r2 down"); }]) {
      const { fetchViralSpots, fetchViralEvents } = await load(get);
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await fetchViralSpots(null)).toEqual([]);
      expect(await fetchViralEvents()).toEqual([]);
    }
    expect(mocks.d1SpotCardsByIds).not.toHaveBeenCalled();
  });
});

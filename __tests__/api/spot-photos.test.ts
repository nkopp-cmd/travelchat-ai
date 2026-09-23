import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/spots/[id]/photos/route";

const mocks = vi.hoisted(() => ({ select: vi.fn(), single: vi.fn(), admin: vi.fn(), limit: vi.fn(), productionLimit: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => mocks.limit, strictPlatformLimit: mocks.productionLimit }));

const id = "550e8400-e29b-41d4-a716-446655440000";
const placeId = "ChIJseoul";
const photoName = (slot: string) => `places/${placeId}/photos/${slot}`;
const spot = {
    name: { en: "Gwangjang Market" }, address: { en: "88 Changgyeonggung-ro, Jongno-gu, Seoul, South Korea" },
    location: { coordinates: [126.999, 37.57] }, category: "Market",
    photos: [`/api/places/photo?name=${photoName("expired")}`], google_place_id: placeId,
};
const details = () => ({
    id: placeId, displayName: { text: "Gwangjang Market" }, formattedAddress: spot.address.en,
    location: { latitude: 37.57, longitude: 126.999 },
    photos: ["fresh1", "fresh1", "fresh2", "fresh3", "fresh4", "fresh5"].map(slot => ({ name: photoName(slot),
        authorAttributions: [{ displayName: "Photographer", uri: "//maps.google.com/maps/contrib/123" },
            { displayName: "Unsafe link", uri: "javascript:alert(1)" }, { displayName: "Name only" }],
    })),
});
const call = (spotId = id) => GET(new NextRequest(`https://localley.io/api/spots/${spotId}/photos`), { params: Promise.resolve({ id: spotId }) });

describe("public spot photo gallery", () => {
    beforeEach(() => {
        vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
        vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
        mocks.limit.mockReset().mockResolvedValue(null);
        mocks.productionLimit.mockReset().mockResolvedValue("ok");
        mocks.single.mockReset().mockResolvedValue({ data: structuredClone(spot), error: null });
        const query = { select: mocks.select, eq: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(), maybeSingle: mocks.single };
        mocks.select.mockReset().mockReturnValue(query);
        mocks.admin.mockReset().mockReturnValue({ from: vi.fn().mockReturnValue(query) });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(details())));
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

    it("gets fresh listing details once and returns four distinct names with attribution", async () => {
        const response = await call();
        const data = await response.json();
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(mocks.select).toHaveBeenCalledWith("*");
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, expect.objectContaining({
            cache: "no-store", redirect: "manual", headers: { "X-Goog-Api-Key": "test-key",
                "X-Goog-FieldMask": "id,displayName,formattedAddress,location,photos" },
        }));
        expect(data.status).toBe("available");
        expect(data.photos).toHaveLength(4);
        expect(new Set(data.photos.map((photo: { id: string }) => photo.id)).size).toBe(4);
        for (const photo of data.photos) {
            const url = new URL(photo.url, "https://localley.io");
            expect(url.searchParams.get("v")).toBe("venue-photos-2");
            expect(url.searchParams.get("name")).not.toContain("expired");
            expect(photo.sourceLabel).toBe("Google listing photo");
            expect(photo.attributions).toEqual([{ displayName: "Photographer", uri: "https://maps.google.com/maps/contrib/123" },
                { displayName: "Unsafe link" }, { displayName: "Name only" }]);
        }
    });

    it("derives only the place ID from stored references", async () => {
        mocks.single.mockResolvedValue({ data: { ...spot, google_place_id: null } });
        expect((await (await call()).json()).status).toBe("available");
        expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain("expired");
    });

    it("rejects invalid UUIDs before any database or provider access", async () => {
        expect((await call("not-a-uuid")).status).toBe(400);
        expect(mocks.admin).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([null, { ...spot, name: { en: "Residential Area" } }, { ...spot, google_place_id: "different" },
        { ...spot, photos: ["https://images.unsplash.com/stock"] }])("hides missing or non-public records", async data => {
        mocks.single.mockResolvedValue({ data, error: null });
        const response = await call();
        expect(response.status).toBe(404);
        expect((await response.json()).photos).toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("does not search or substitute stock without a trusted Google identity", async () => {
        mocks.single.mockResolvedValue({ data: { ...spot, google_place_id: null, photos: ["https://localley.io/uploads/listing.jpg"] } });
        const response = await call();
        expect((await response.json()).status).toBe("unavailable");
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([placeId, null])("rejects mixed stored listing identities (stored ID: %s)", async googlePlaceId => {
        mocks.single.mockResolvedValue({ data: { ...spot, google_place_id: googlePlaceId,
            photos: [...spot.photos, "/api/places/photo?name=places/other/photos/expired"] } });
        expect((await (await call()).json()).status).toBe("unavailable");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("handles database failure without leaking details", async () => {
        mocks.single.mockResolvedValue({ data: null, error: { message: "private SQL" } });
        const response = await call();
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("private SQL");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("returns unavailable when the API key is missing", async () => {
        vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
        expect((await call()).status).toBe(503);
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([403, 404, 429, 500])("returns explicit upstream failure without fallback (%s)", async status => {
        vi.mocked(fetch).mockResolvedValue(new Response("private provider error", { status }));
        const response = await call();
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("private provider error");
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each([
        { id: "different" }, { formattedAddress: "Tokyo, Japan" },
        { location: { latitude: 35.68, longitude: 139.69 } },
        { location: { latitude: 37.60, longitude: 126.999 } },
        { location: { latitude: 999, longitude: 126 } },
    ])("rejects contradictory identity evidence", async change => {
        vi.mocked(fetch).mockResolvedValue(Response.json({ ...details(), ...change }));
        expect((await call()).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("accepts Korean names when the ID, city and coordinates agree", async () => {
        vi.mocked(fetch).mockResolvedValue(Response.json({ ...details(), displayName: { text: "광장시장" } }));
        expect((await (await call()).json()).status).toBe("available");
    });

    it("uses name and address evidence when stored coordinates are absent", async () => {
        mocks.single.mockResolvedValue({ data: { ...spot, location: null } });
        expect((await (await call()).json()).status).toBe("available");
    });

    it("rejects unrelated names without coordinate evidence", async () => {
        mocks.single.mockResolvedValue({ data: { ...spot, location: null } });
        vi.mocked(fetch).mockResolvedValue(Response.json({ ...details(), displayName: { text: "Unrelated Store" }, formattedAddress: "77 Other Road, Seoul, South Korea" }));
        expect((await call()).status).toBe(502);
    });

    it("does not use malformed, cross-place, or absent photo names", async () => {
        vi.mocked(fetch).mockResolvedValue(Response.json({ ...details(), photos: [
            { name: "places/other/photos/x" }, { name: photoName("../bad") },
        ] }));
        expect((await (await call()).json()).status).toBe("unavailable");
    });

    it.each(["not JSON", "null", JSON.stringify({ ...details(), padding: "x".repeat(256 * 1024) })])("rejects invalid or oversized metadata", async body => {
        vi.mocked(fetch).mockResolvedValue(new Response(body));
        expect((await call()).status).toBe(502);
    });

    it("rejects oversized declared metadata before reading", async () => {
        vi.mocked(fetch).mockResolvedValue(new Response("{}", { headers: { "content-length": "262145" } }));
        expect((await call()).status).toBe(502);
    });

    it("aborts metadata timeouts", async () => {
        vi.useFakeTimers();
        vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }));
        const pending = call();
        await vi.advanceTimersByTimeAsync(10_000);
        expect((await pending).status).toBe(504);
    });

    it("uses one development IP bucket across all UUIDs", async () => {
        mocks.limit.mockResolvedValue(new Response(null, { status: 429 }));
        expect((await call()).status).toBe(429);
        expect(mocks.limit.mock.calls[0][0].nextUrl.pathname).toBe("/api/spots/photos");
        expect(mocks.admin).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it("uses the strict platform limiter in production and never the development helper", async () => {
        vi.stubEnv("NODE_ENV", "production");
        mocks.productionLimit.mockResolvedValue("limited");
        const response = await call();
        expect(response.status).toBe(429);
        expect(mocks.productionLimit).toHaveBeenCalledWith(expect.anything(), 40, "venue_photos_v2");
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each(["unavailable", "error", "limited"])("fails closed in production: %s", async mode => {
        vi.stubEnv("NODE_ENV", "production");
        if (mode === "error") mocks.productionLimit.mockRejectedValue(new Error("unavailable"));
        else mocks.productionLimit.mockResolvedValue(mode);
        const response = await call();
        expect(response.status).toBe(mode === "limited" ? 429 : mode === "error" ? 502 : 503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(mocks.admin).not.toHaveBeenCalled();
        expect(mocks.limit).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });
});

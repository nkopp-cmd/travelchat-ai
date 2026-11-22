import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/places-quota", () => ({ reservePlacesCall: vi.fn(async () => true) })); // the cap has its own test
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
const browser = { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" } };
const call = (spotId = id) => GET(new NextRequest(`https://localley.io/api/spots/${spotId}/photos`, browser), { params: Promise.resolve({ id: spotId }) });

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
        vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json(details())));
    });
    afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

    it("gets fresh listing details once and returns four distinct names with attribution", async () => {
        const response = await call();
        const data = await response.json();
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, max-age=600");
        expect(mocks.select).toHaveBeenCalledWith("*");
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, expect.objectContaining({
            cache: "no-store", redirect: "manual", headers: { "X-Goog-Api-Key": "test-key",
                "X-Goog-FieldMask": "id,location,photos" },
        }));
        expect(data.status).toBe("available");
        expect(data.photos).toHaveLength(4);
        expect(new Set(data.photos.map((photo: { id: string }) => photo.id)).size).toBe(4);
        for (const [index, photo] of data.photos.entries()) {
            const url = new URL(photo.url, "https://localley.io");
            expect(url.searchParams.get("i")).toBe(String(index));
            expect(url.searchParams.get("v")).toBe("venue-photos-3");
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
        { id: "different" },
        { location: { latitude: 35.68, longitude: 139.69 } },
        { location: undefined },
        { location: { latitude: 37.65, longitude: 126.999 } },
        { location: { latitude: 999, longitude: 126 } },
    ])("rejects contradictory identity evidence", async change => {
        vi.mocked(fetch).mockResolvedValue(Response.json({ ...details(), ...change }));
        expect((await call()).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("checks the listing name when the stored coordinates are 1-5 km off (Push CF2)", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            // 3.3 km off, same name: one Essentials call plus one Pro name call, then available.
            vi.mocked(fetch).mockImplementation(async () => Response.json({ ...details(), location: { latitude: 37.60, longitude: 126.999 } }));
            expect((await (await call()).json()).status).toBe("available");
            expect(fetch).toHaveBeenCalledTimes(2);
            // 3.3 km off, unrelated name: a name conflict.
            vi.mocked(fetch).mockImplementation(async () => Response.json({ ...details(), location: { latitude: 37.60, longitude: 126.999 },
                displayName: { text: "Unrelated Store" }, formattedAddress: "77 Other Road, Seoul, South Korea" }));
            expect((await call()).status).toBe(502);
            expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"listing_name_conflict"'));
            // 0.5 km off: no name call.
            vi.mocked(fetch).mockClear();
            vi.mocked(fetch).mockImplementation(async () => Response.json({ ...details(), location: { latitude: 37.5745, longitude: 126.999 } }));
            expect((await (await call()).json()).status).toBe("available");
            expect(fetch).toHaveBeenCalledTimes(1);
            // 8.9 km off: a coordinate conflict without a name call, whatever the name.
            vi.mocked(fetch).mockClear();
            vi.mocked(fetch).mockImplementation(async () => Response.json({ ...details(), location: { latitude: 37.65, longitude: 126.999 } }));
            expect((await call()).status).toBe(502);
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(log).toHaveBeenLastCalledWith(expect.stringContaining('"reason":"listing_coordinate_conflict"'));
        } finally { log.mockRestore(); }
    });

    it("takes the stored city when the address text names none", async () => {
        const noCity = { ...structuredClone(spot), address: { en: "88 Changgyeonggung-ro, Jongno-gu" } };
        mocks.single.mockResolvedValue({ data: noCity, error: null });
        expect((await call()).status).toBe(502);
        mocks.single.mockResolvedValue({ data: { ...noCity, city: "Seoul" }, error: null });
        expect((await (await call()).json()).status).toBe("available");
        // A stored city far from the listing does not pass on its own.
        mocks.single.mockResolvedValue({ data: { ...noCity, city: "Tokyo" }, error: null });
        expect((await call()).status).toBe(502);
    });

    it("remembers an identity conflict at the edge so the next visitor costs no Details call", async () => {
        const store = new Map<string, Response>();
        vi.stubGlobal("caches", { default: {
            match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
            put: vi.fn(async (request: Request, response: Response) => { store.set(request.url, response); }),
        } });
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            vi.mocked(fetch).mockImplementation(async () => Response.json({ ...details(), location: { latitude: 37.65, longitude: 126.999 } }));
            expect((await call()).status).toBe(502);
            expect([...store.keys()]).toEqual([`https://spot-photo-verdict.localley.internal/v2/${id}/${placeId}/37.57,126.999`]);
            const second = await call();
            expect(second.status).toBe(200);
            expect((await second.json()).status).toBe("unavailable");
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(log).toHaveBeenCalledOnce();
            // A corrected listing (new coordinates) is checked again.
            mocks.single.mockResolvedValue({ data: { ...structuredClone(spot), location: { coordinates: [126.999, 37.65] } }, error: null });
            expect((await (await call()).json()).status).toBe("available");
            expect(fetch).toHaveBeenCalledTimes(2);
        } finally { log.mockRestore(); }
    });

    it("does not remember provider outages", async () => {
        const store = new Map<string, Response>();
        vi.stubGlobal("caches", { default: {
            match: vi.fn(async (request: Request) => store.get(request.url)?.clone()),
            put: vi.fn(async (request: Request, response: Response) => { store.set(request.url, response); }),
        } });
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            vi.mocked(fetch).mockResolvedValue(new Response("busy", { status: 429 }));
            expect((await call()).status).toBe(502);
            expect(store.size).toBe(0);
        } finally { log.mockRestore(); }
    });

    it("accepts Korean names when the ID, city and coordinates agree", async () => {
        vi.mocked(fetch).mockResolvedValue(Response.json({ ...details(), displayName: { text: "광장시장" } }));
        expect((await (await call()).json()).status).toBe("available");
    });

    it("logs the source and fixed coordinate rejection without private provider data", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            vi.mocked(fetch).mockResolvedValue(Response.json({ ...details(),
                location: { latitude: 37.65, longitude: 126.999 },
                private: "secret-key person@example.com https://private.example/?token=secret",
            }));
            const response = await call();
            expect(response.status).toBe(502);
            expect((await response.json()).photos).toEqual([]);
            expect(log).toHaveBeenCalledExactlyOnceWith(`[spot-photos] ${JSON.stringify({
                spotId: id, reason: "listing_coordinate_conflict", status: 502,
            })}`);
        } finally { log.mockRestore(); }
    });

    it("records only the upstream HTTP status and never its response body", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            vi.mocked(fetch).mockResolvedValue(new Response("private provider token", { status: 429 }));
            expect((await call()).status).toBe(502);
            expect(log).toHaveBeenCalledExactlyOnceWith(`[spot-photos] ${JSON.stringify({
                spotId: id, reason: "provider_http", status: 502, upstreamStatus: 429,
            })}`);
        } finally { log.mockRestore(); }
    });

    it("reports database failure without its private error payload", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            mocks.single.mockResolvedValue({ data: null, error: { message: "secret SQL password" } });
            expect((await call()).status).toBe(503);
            expect(log).toHaveBeenCalledExactlyOnceWith(`[spot-photos] ${JSON.stringify({
                spotId: id, reason: "source_unavailable", status: 503,
            })}`);
        } finally { log.mockRestore(); }
    });

    it("uses name and address evidence when stored coordinates are absent", async () => {
        mocks.single.mockResolvedValue({ data: { ...spot, location: null } });
        expect((await (await call()).json()).status).toBe("available");
        // Only this rare path pays for the Pro name fields, in a second call.
        expect(vi.mocked(fetch).mock.calls.map(([, init]) => (init?.headers as Record<string, string>)["X-Goog-FieldMask"]))
            .toEqual(["id,location,photos", "id,displayName,formattedAddress"]);
    });

    it("never asks for Pro fields when stored coordinates corroborate the listing", async () => {
        await call();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(vi.mocked(fetch).mock.calls)).not.toMatch(/displayName|formattedAddress/);
    });

    it("rejects unrelated names without coordinate evidence", async () => {
        mocks.single.mockResolvedValue({ data: { ...spot, location: null } });
        vi.mocked(fetch).mockImplementation(async () => Response.json({ ...details(), displayName: { text: "Unrelated Store" }, formattedAddress: "77 Other Road, Seoul, South Korea" }));
        expect((await call()).status).toBe(502);
        expect(fetch).toHaveBeenCalledTimes(2);
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
    it.each([
        ["rate limiter throws", () => { vi.stubEnv("NODE_ENV", "production"); mocks.productionLimit.mockRejectedValue(new RangeError("secret detail")); }, "rate_limit_exception", "RangeError"],
        ["source throws", () => { mocks.single.mockRejectedValue(new TypeError("secret detail")); }, "source_exception", "TypeError"],
        ["provider fetch throws", () => { vi.mocked(fetch).mockRejectedValue(new TypeError("secret detail")); }, "provider_fetch_exception", "TypeError"],
    ])("names the stage and error class of a throw, never its message (Push CF3): %s", async (_name, arrange, reason, errorName) => {
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        const info = vi.spyOn(console, "log").mockImplementation(() => {});
        arrange();
        const response = await call();
        expect(response.status).toBe(502);
        const lines = log.mock.calls.map(([line]) => String(line)).filter(line => line.startsWith("[spot-photos] {"));
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0].slice("[spot-photos] ".length))).toMatchObject({ reason, status: 502, errorName });
        expect(lines[0]).not.toContain("secret detail");
        log.mockRestore();
        info.mockRestore();
    });
    describe("outcome log (push AQ2)", () => {
        const outcomes = (log: ReturnType<typeof vi.spyOn>) => log.mock.calls
            .filter(([tag]) => tag === "[spot-photos] outcome").map(([, json]) => JSON.parse(String(json)));
        const bot = (spotId = id) => GET(new NextRequest(`https://localley.io/api/spots/${spotId}/photos`, { headers: { "user-agent": "Googlebot/2.1" } }),
            { params: Promise.resolve({ id: spotId }) });

        it.each([
            ["available", () => call(), { status: 200, result: "available", reason: "ok", spotId: id }],
            ["automated", () => bot(), { status: 200, result: "unavailable", reason: "automated", spotId: id }],
            ["invalid id", () => call("not-a-uuid"), { status: 400, result: "unavailable", reason: "invalid_id" }],
            ["no place id", () => { mocks.single.mockResolvedValue({ data: { ...spot, google_place_id: null, photos: ["https://localley.io/uploads/listing.jpg"] } }); return call(); },
                { status: 200, result: "unavailable", reason: "no_place_id", spotId: id }],
            ["not public", () => { mocks.single.mockResolvedValue({ data: null, error: null }); return call(); },
                { status: 404, result: "unavailable", reason: "not_public", spotId: id }],
            ["database failure", () => { mocks.single.mockResolvedValue({ data: null, error: { message: "private SQL" } }); return call(); },
                { status: 503, result: "unavailable", reason: "source_unavailable", spotId: id }],
            ["no provider photos", () => { vi.mocked(fetch).mockImplementation(async () => Response.json({ ...details(), photos: [] })); return call(); },
                { status: 200, result: "unavailable", reason: "no_provider_photos", spotId: id }],
        ])("writes one line with a fixed reason: %s", async (_name, run, expected) => {
            const log = vi.spyOn(console, "log").mockImplementation(() => {});
            vi.spyOn(console, "error").mockImplementation(() => {});
            await run();
            const lines = outcomes(log);
            expect(lines).toHaveLength(1);
            expect(lines[0]).toMatchObject(expected);
            expect(Object.keys(lines[0]).sort()).toEqual(["ms", "reason", "result", "status", ...("spotId" in expected ? ["spotId"] : [])].sort());
            expect(lines[0].ms).toBeGreaterThanOrEqual(0);
            expect(JSON.stringify(lines[0])).not.toMatch(/Googlebot|Mozilla|private SQL|places\//);
            log.mockRestore();
        });
    });
});

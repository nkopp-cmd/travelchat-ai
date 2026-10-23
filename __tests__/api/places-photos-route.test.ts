// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), tier: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier }));

import { GET } from "@/app/api/places/photos/route";

const call = (query = "Lucyd Brunch", city = "Seoul") =>
  GET(new NextRequest(`https://www.localley.io/api/places/photos?query=${encodeURIComponent(query)}&city=${city}`));

beforeEach(() => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  mocks.auth.mockResolvedValue({ userId: "user-1" });
  mocks.tier.mockResolvedValue("pro");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes(":searchText")
    ? Response.json({ places: [{ id: "ChIJabc" }] })
    : Response.json({ id: "ChIJabc", photos: [{ name: "places/ChIJabc/photos/p1" }], formattedAddress: "1 Seoul-ro, Seoul", location: { latitude: 37.5, longitude: 127 } })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/places/photos (Places API New, cheapest tiers)", () => {
  it("uses an IDs-only Text Search and an Essentials Details mask, no rating and no phone call", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      photoUrl: expect.stringContaining("name=places%2FChIJabc%2Fphotos%2Fp1"), rating: null, totalRatings: null, phone: null,
      placeId: "ChIJabc", formattedAddress: "1 Seoul-ro, Seoul", lat: 37.5, lng: 127,
    });
    const calls = vi.mocked(fetch).mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2);
    expect((calls[0][1].headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("places.id");
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ textQuery: "Lucyd Brunch, Seoul", pageSize: 1 });
    expect((calls[1][1].headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("id,photos,formattedAddress,location");
    expect(calls.map(([url]) => url).join(" ")).not.toMatch(/maps\.googleapis\.com|upstash|formatted_phone_number/);
  });

  it("returns an empty result without a match and refuses free or signed-out users before any Google call", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () => Response.json({}));
    expect(await (await call()).json()).toMatchObject({ photoUrl: null, placeId: null });
    vi.mocked(fetch).mockClear();
    mocks.tier.mockResolvedValue("free");
    expect((await call()).status).toBe(403);
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await call()).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores a photo name that belongs to another place", async () => {
    vi.mocked(fetch).mockImplementation(async (url: string) => String(url).includes(":searchText")
      ? Response.json({ places: [{ id: "ChIJabc" }] })
      : Response.json({ id: "ChIJabc", photos: [{ name: "places/OTHER/photos/p1" }] }));
    expect((await (await call()).json()).photoUrl).toBeNull();
  });
});

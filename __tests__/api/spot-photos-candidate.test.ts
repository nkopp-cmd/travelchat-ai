import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ read: vi.fn(), admin: vi.fn(), publicReader: vi.fn(), limit: vi.fn(), platform: vi.fn() }));
vi.mock("@/lib/app-data/preview-spot-photos", async original => ({
  ...await original<typeof import("@/lib/app-data/preview-spot-photos")>(),
  previewSpotPhotoSource: mocks.read,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin, createSupabaseClient: mocks.publicReader }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => mocks.limit, strictPlatformLimit: mocks.platform }));
import { GET } from "@/app/api/spots/[id]/photos/route";

const id = "550e8400-e29b-41d4-a716-446655440000";
const spot = { id, name: { en: "Gwangjang Market" },
  address: { en: "88 Changgyeonggung-ro, Jongno-gu, Seoul, South Korea" },
  location: { coordinates: [126.999, 37.57] }, category: "Market",
  photos: ["https://localley.io/uploads/listing.jpg"], google_place_id: null };
const environment = process.env;
const request = (host: string, candidate = true) => GET(new NextRequest(
  `https://${host}/api/spots/${id}/photos${candidate ? "?data_candidate=d1" : ""}`),
  { params: Promise.resolve({ id }) });

beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true",
    GOOGLE_PLACES_API_KEY: "test-key" };
  mocks.limit.mockResolvedValue(null);
  mocks.platform.mockResolvedValue("ok");
  mocks.read.mockResolvedValue(spot);
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: spot, error: null }) };
  mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
  mocks.publicReader.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { process.env = environment; vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("spot photo source candidate", () => {
  it("reads an exact preview source without a provider call", async () => {
    const response = await request("localley-next-preview.nkopp.workers.dev");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect((await response.json()).status).toBe("unavailable");
    expect(mocks.read).toHaveBeenCalledWith(id);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses missing, weak, and malformed candidate records", async () => {
    mocks.read.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...spot, name: { en: "Residential Area" } })
      .mockRejectedValueOnce(new Error("private payload"));
    const host = "localley-next-preview.nkopp.workers.dev";
    expect((await request(host)).status).toBe(404);
    expect((await request(host)).status).toBe(404);
    const malformed = await request(host);
    expect(malformed.status).toBe(503);
    expect(await malformed.text()).not.toContain("private payload");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    const preview = await request("localley-next-preview.nkopp.workers.dev", false);
    const www = await request("www.localley.io");
    expect([preview.status, www.status]).toEqual([200, 200]);
    expect(preview.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(www.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.admin).toHaveBeenCalledTimes(1);
    expect(mocks.publicReader).toHaveBeenCalledTimes(1);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("does not use the public-preview reader on foreign hosts or without safety flags", async () => {
    await request("preview.example.com", false);
    process.env.SUPABASE_READ_ONLY = "false";
    await request("localley-next-preview.nkopp.workers.dev", false);
    process.env.SUPABASE_READ_ONLY = "true";
    process.env.AUTH_MAIL_MODE = "live";
    await request("localley-next-preview.nkopp.workers.dev", false);
    expect(mocks.publicReader).not.toHaveBeenCalled();
    expect(mocks.admin).toHaveBeenCalledTimes(3);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("keeps stored Google identity checks on the candidate", async () => {
    mocks.read.mockResolvedValue({ ...spot, google_place_id: "ChIJseoul",
      photos: ["/api/places/photo?name=places/ChIJseoul/photos/old"] });
    vi.mocked(fetch).mockResolvedValue(Response.json({ id: "wrong", displayName: { text: "Gwangjang Market" },
      formattedAddress: spot.address.en, location: { latitude: 37.57, longitude: 126.999 } }));
    const response = await request("localley-next-preview.nkopp.workers.dev");
    expect(response.status).toBe(502);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});

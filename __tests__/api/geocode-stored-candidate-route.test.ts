import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), stored: vi.fn(), cascade: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-stored-geocode", async original => ({
  ...await original<typeof import("@/lib/app-data/preview-stored-geocode")>(),
  previewStoredGeocode: mocks.stored,
}));
vi.mock("@/lib/geocoding", () => ({ geocodeWithCascade: mocks.cascade }));
import { GET } from "@/app/api/geocode/route";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });
const request = (host: string, flag = true, city = "Seoul") => GET(new NextRequest(
  `https://${host}/api/geocode?address=88+Market+Road&city=${city}${flag ? "&data_candidate=d1" : ""}`));
const preview = () => { process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" }; };

describe("stored geocode candidate route", () => {
  it("authorizes before reading D1, then returns private stored coordinates", async () => {
    preview();
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "owner" });
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(401);
    expect(mocks.stored).not.toHaveBeenCalled();
    mocks.stored.mockResolvedValue({ lat: 37.57, lng: 126.999, provider: "stored" });
    const result = await request("localley-next-preview.nkopp.workers.dev");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ lat: 37.57, lng: 126.999, provider: "stored" });
    expect(result.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.cascade).not.toHaveBeenCalled();
  });

  it("refuses invalid, missing and incomplete candidate data without provider fallback", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "owner" });
    expect((await request("localley-next-preview.nkopp.workers.dev", true, "")).status).toBe(400);
    mocks.stored.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("D1 failure"));
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(404);
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(503);
    expect(mocks.cascade).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on the provider cascade", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.cascade.mockResolvedValue({ lat: 37.57, lng: 126.999, provider: "nominatim" });
    const normal = await request("localley-next-preview.nkopp.workers.dev", false);
    const www = await request("www.localley.io");
    expect(normal.status).toBe(200);
    expect(www.status).toBe(200);
    expect(normal.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.cascade).toHaveBeenCalledTimes(2);
    expect(mocks.stored).not.toHaveBeenCalled();
  });
});

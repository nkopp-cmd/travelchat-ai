import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), stored: vi.fn(), cascade: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-stored-geocode", async original => ({
  ...await original<typeof import("@/lib/app-data/preview-stored-geocode")>(),
  previewStoredGeocode: mocks.stored,
}));
vi.mock("@/lib/geocoding", () => ({ batchGeocode: mocks.cascade }));
import { POST } from "@/app/api/geocode/batch/route";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });
const preview = () => { process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" }; };
const items = [
  { address: "Market Road", city: "Seoul", name: "Market" },
  { address: "Missing Road", city: "Seoul", name: "Missing" },
  { address: "Museum Road", city: "Seoul", name: "Museum" },
];
const request = (host: string, body: unknown = { items }, flag = true) => POST(new NextRequest(
  `https://${host}/api/geocode/batch${flag ? "?data_candidate=d1" : ""}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("stored batch geocode candidate", () => {
  it("authorizes first and preserves item order and missing nulls without providers", async () => {
    preview();
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "owner" });
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(401);
    expect(mocks.stored).not.toHaveBeenCalled();
    mocks.stored.mockResolvedValueOnce({ lat: 37.57, lng: 126.999, provider: "stored" })
      .mockResolvedValueOnce(null).mockResolvedValueOnce({ lat: 37.58, lng: 127, provider: "stored" });
    const result = await request("localley-next-preview.nkopp.workers.dev");
    expect(result.status).toBe(200);
    expect(result.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(await result.json()).toEqual({ results: [
      { lat: 37.57, lng: 126.999, provider: "stored" }, null,
      { lat: 37.58, lng: 127, provider: "stored" },
    ] });
    expect(mocks.stored.mock.calls).toEqual([
      ["Market Road", "Seoul", "Market"], ["Missing Road", "Seoul", "Missing"],
      ["Museum Road", "Seoul", "Museum"],
    ]);
    expect(mocks.cascade).not.toHaveBeenCalled();
  });

  it("refuses invalid limits and malformed items before D1", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "owner" });
    for (const body of [{ items: [] }, { items: Array(31).fill(items[0]) },
      { items: [{ address: "x", city: "" }] },
      { items: [{ address: "x".repeat(513), city: "Seoul" }] },
      { items: [{ address: {}, city: "Seoul" }] },
      { items: [{ address: "Road", city: "Seoul", name: null }] }]) {
      expect((await request("localley-next-preview.nkopp.workers.dev", body)).status).toBe(400);
    }
    expect(mocks.stored).not.toHaveBeenCalled();
    expect(mocks.cascade).not.toHaveBeenCalled();
  });

  it("fails the whole batch closed when one archive read fails", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.stored.mockResolvedValueOnce({ lat: 37.57, lng: 126.999, provider: "stored" })
      .mockRejectedValueOnce(new Error("malformed source")).mockResolvedValueOnce(null);
    const result = await request("localley-next-preview.nkopp.workers.dev");
    expect(result.status).toBe(503);
    expect(result.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.cascade).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on the provider batch", async () => {
    preview(); mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.cascade.mockResolvedValue([null, null, null]);
    const normal = await request("localley-next-preview.nkopp.workers.dev", { items }, false);
    const www = await request("www.localley.io");
    expect(normal.status).toBe(200);
    expect(www.status).toBe(200);
    expect(normal.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.cascade).toHaveBeenCalledTimes(2);
    expect(mocks.stored).not.toHaveBeenCalled();
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewStoredGeocodeCandidate, previewStoredGeocode,
  validStoredGeocodeQuery } from "@/lib/app-data/preview-stored-geocode";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });
const id = "550e8400-e29b-41d4-a716-446655440000";
const address = "88 Changgyeonggung-ro, Seoul";
function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE spots (id TEXT PRIMARY KEY, name TEXT, address TEXT, city TEXT,
    latitude REAL, longitude REAL, visible INTEGER);
    CREATE TABLE legacy_spot_source (spotId TEXT PRIMARY KEY, payload TEXT, publicIssue TEXT);`);
  mocks.reader.mockReturnValue(db);
  return db;
}
function spot(db: D1Sqlite, options: { id?: string; visible?: number; lat?: number; lng?: number;
  sourceLat?: number; sourceLng?: number; publicIssue?: string | null; name?: string } = {}) {
  const spotId = options.id ?? id;
  const lat = options.lat ?? 37.57;
  const lng = options.lng ?? 126.999;
  const payload = { id: spotId, name: { en: options.name ?? "Gwangjang Market" }, address: { en: address },
    location: { type: "Point", coordinates: [options.sourceLng ?? lng, options.sourceLat ?? lat] } };
  db.sqlite.prepare("INSERT INTO spots VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(spotId, JSON.stringify(payload.name), JSON.stringify(payload.address), "seoul", lat, lng,
      options.visible ?? 1);
  db.sqlite.prepare("INSERT INTO legacy_spot_source VALUES (?, ?, ?)")
    .run(spotId, JSON.stringify(payload), options.publicIssue ?? null);
}

describe("stored map geocode candidate", () => {
  it("requires exact preview host, flag and isolated environment", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const req = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/geocode?address=x&city=Seoul${flag ? "&data_candidate=d1" : ""}`);
    expect(isPreviewStoredGeocodeCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewStoredGeocodeCandidate(req("www.localley.io"))).toBe(false);
    expect(isPreviewStoredGeocodeCandidate(req("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    process.env.AUTH_MAIL_MODE = "cloudflare";
    expect(isPreviewStoredGeocodeCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("bounds address, city and optional name", () => {
    expect(validStoredGeocodeQuery(address, "Seoul", null)).toBe(true);
    expect(validStoredGeocodeQuery(address, "Seoul", "Gwangjang Market")).toBe(true);
    for (const bad of [["", "Seoul", null], [address, "", null], ["x".repeat(513), "Seoul", null],
      [address, "x".repeat(101), null], [address, "Seoul", ""]] as const) {
      expect(validStoredGeocodeQuery(...bad)).toBe(false);
    }
  });

  it("returns stored coordinates only for one exact visible source", async () => {
    const db = database(); spot(db);
    expect(await previewStoredGeocode(` ${address.toUpperCase()} `, "SEOUL", "Gwangjang Market"))
      .toEqual({ lat: 37.57, lng: 126.999, provider: "stored" });
    expect(await previewStoredGeocode("Different address", "Seoul", null)).toBeNull();
    expect(await previewStoredGeocode(address, "Tokyo", null)).toBeNull();
    db.sqlite.prepare("UPDATE spots SET visible = 0").run();
    expect(await previewStoredGeocode(address, "Seoul", null)).toBeNull();
  });

  it("refuses ambiguous source and mismatched coordinates", async () => {
    const db = database(); spot(db); spot(db, { id: "other-spot", name: "Other Market" });
    await expect(previewStoredGeocode(address, "Seoul", null)).rejects.toThrow("ambiguous");
    expect(await previewStoredGeocode(address, "Seoul", "Gwangjang Market"))
      .toEqual({ lat: 37.57, lng: 126.999, provider: "stored" });
    db.sqlite.prepare("DELETE FROM legacy_spot_source WHERE spotId = 'other-spot'").run();
    db.sqlite.prepare("DELETE FROM spots WHERE id = 'other-spot'").run();
    db.sqlite.prepare("UPDATE spots SET latitude = 37.8").run();
    await expect(previewStoredGeocode(address, "Seoul", null)).rejects.toThrow("source mismatch");
  });

  it("refuses public issues and malformed source payload", async () => {
    const db = database(); spot(db, { publicIssue: "weak" });
    await expect(previewStoredGeocode(address, "Seoul", null)).rejects.toThrow("Invalid stored map location");
    db.sqlite.prepare("UPDATE legacy_spot_source SET publicIssue = NULL, payload = 'bad-json'").run();
    await expect(previewStoredGeocode(address, "Seoul", null)).rejects.toThrow();
  });
});

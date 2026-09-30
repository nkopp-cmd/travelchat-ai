// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { previewSpotPageData } from "@/lib/app-data/preview-spot-page";

const visible = "0041a575-c6fd-4a7e-b9c3-56cc50e201d6";
const hidden = "052a314e-4aff-42c5-87f5-afa085efad0e";
let db: D1Sqlite;
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE spots (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
    address TEXT NOT NULL, category TEXT NOT NULL, localley_score INTEGER, photos TEXT,
    latitude REAL, longitude REAL, city TEXT, visible INTEGER NOT NULL);
    INSERT INTO spots VALUES ('${visible}','{"en":"Seodaemun Independence Park"}',
      '{"en":"A historic park"}','251, Tongil-ro, Seoul','park',4,
      '["/pilot/park.jpg"]',37.575,126.955,'Seoul',1);
    INSERT INTO spots VALUES ('${hidden}','{"en":"Hidden"}',
      '{"en":"Hidden place"}','Seoul','park',4,'[]',37.5,126.9,'Seoul',0);`);
  mocks.reader.mockReturnValue(db);
});
afterEach(() => { db.sqlite.close(); vi.clearAllMocks(); });

describe("preview spot page data", () => {
  it("reads one published normalized spot without source services", async () => {
    expect(await previewSpotPageData(visible)).toEqual({ id: visible,
      name: "Seodaemun Independence Park", description: "A historic park",
      address: "251, Tongil-ro, Seoul", category: "park", score: 4,
      photos: ["/pilot/park.jpg"], lat: 37.575, lng: 126.955, city: "Seoul" });
  });

  it("hides unpublished, absent and malformed IDs", async () => {
    expect(await previewSpotPageData(hidden)).toBeNull();
    expect(await previewSpotPageData("bad")).toBeNull();
    expect(await previewSpotPageData("11111111-1111-4111-8111-111111111111")).toBeNull();
  });

  it("fails closed on bad public fields and coordinates", async () => {
    db.sqlite.prepare("UPDATE spots SET latitude = 95 WHERE id = ?").run(visible);
    await expect(previewSpotPageData(visible)).rejects.toThrow();
    db.sqlite.prepare("UPDATE spots SET latitude = 37.575, photos = ? WHERE id = ?")
      .run('["ok", 3]', visible);
    await expect(previewSpotPageData(visible)).rejects.toThrow();
  });
});

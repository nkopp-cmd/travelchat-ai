// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewRecommendationsCandidate, previewRecommendations } from "@/lib/app-data/preview-recommendations";

const originalEnv = process.env;
let db: D1Sqlite;
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT NOT NULL);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL,
      city TEXT, activities TEXT, created_at TEXT);
    CREATE TABLE spots(id TEXT PRIMARY KEY, name TEXT, description TEXT, address TEXT,
      category TEXT, localley_score INTEGER, photos TEXT, latitude REAL, longitude REAL,
      visible INTEGER);
    INSERT INTO owners VALUES ('user_one','legacy-fixture'),('user_two','legacy-fixture');
    INSERT INTO legacy_owners VALUES ('user_one','user_one'),('user_two','user_two');
    INSERT INTO itineraries VALUES
      ('trip_one','user_one','Seoul','[{"activities":[{"name":"Outdoor park walk"}]}]','2026-09-30T10:00:00Z'),
      ('trip_two','user_two','Seoul','[{"activities":[{"name":"Cafe coffee"}]}]','2026-09-30T10:00:00Z');
    INSERT INTO spots VALUES
      ('550e8400-e29b-41d4-a716-446655440000','{"en":"Park"}','Park','Seoul','Outdoor',5,'[]',37.5,127,1),
      ('550e8400-e29b-41d4-a716-446655440001','{"en":"Cafe"}','Cafe','Seoul','Cafe',6,'[]',37.6,127,1),
      ('550e8400-e29b-41d4-a716-446655440002','{"en":"Hidden"}','Hidden','Seoul','Outdoor',6,'[]',37.7,127,0);`);
  mocks.reader.mockReturnValue(db);
});
afterEach(() => { db.sqlite.close(); process.env = originalEnv; vi.clearAllMocks(); });

describe("preview recommendations", () => {
  it("requires the isolated host, flag and read-only settings", () => {
    process.env = { ...originalEnv, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag: string) => new NextRequest(`https://${host}/api/recommendations?data_candidate=${flag}`);
    expect(isPreviewRecommendationsCandidate(request("localley-next-preview.nkopp.workers.dev", "d1"))).toBe(true);
    expect(isPreviewRecommendationsCandidate(request("www.localley.io", "d1"))).toBe(false);
    expect(isPreviewRecommendationsCandidate(request("localley-next-preview.nkopp.workers.dev", "other"))).toBe(false);
    process.env.SUPABASE_READ_ONLY = "false";
    expect(isPreviewRecommendationsCandidate(request("localley-next-preview.nkopp.workers.dev", "d1"))).toBe(false);
  });

  it("uses exact owner history and excludes hidden spots", async () => {
    const first = await previewRecommendations("user_one", 2);
    const second = await previewRecommendations("user_two", 2);
    const fresh = await previewRecommendations("new_user", 2);
    expect(first.map(row => row.name)).toEqual(["Park", "Cafe"]);
    expect(second.map(row => row.name)).toEqual(["Cafe", "Park"]);
    expect(fresh.map(row => row.name)).toEqual(["Cafe", "Park"]);
    expect(first[0].location).toEqual({ type: "Point", coordinates: [127, 37.5] });
    expect(first.some(row => row.name === "Hidden")).toBe(false);
  });

  it("fails closed on malformed catalog data and invalid limits", async () => {
    await expect(previewRecommendations("user_one", 21)).rejects.toThrow(RangeError);
    db.sqlite.prepare("UPDATE spots SET photos = ? WHERE name = ?").run('["ok",3]', '{"en":"Park"}');
    await expect(previewRecommendations("user_one", 2)).rejects.toThrow("Invalid recommendation spot");
  });
});

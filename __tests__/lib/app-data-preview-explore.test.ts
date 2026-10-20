// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { previewPopularCities, previewPublicItineraries } from "@/lib/app-data/preview-explore";

const id = (n: number) => `550e8400-e29b-41d4-a716-44665544000${n}`;
let db: D1Sqlite;
function database() {
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT, title TEXT, city TEXT, days INTEGER,
      local_score REAL, highlights TEXT, created_at TEXT, shared INTEGER, share_code TEXT);
    CREATE TABLE legacy_itinerary_media(itineraryId TEXT PRIMARY KEY, viewCount INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE preview_itinerary_likes(ownerId TEXT, itineraryId TEXT);
    INSERT INTO itineraries VALUES ('${id(1)}','a','Seoul eats','Seoul',2,7,'["Markets"]','2026-10-01T00:00:00Z',1,'abcd1234');
    INSERT INTO itineraries VALUES ('${id(2)}','b','Seoul long','Seoul',8,9,NULL,'2026-09-01T00:00:00Z',1,'efgh5678');
    INSERT INTO itineraries VALUES ('${id(3)}','c','Tokyo day','Tokyo',1,5,'[]','2026-10-05T00:00:00Z',1,'ijkl9012');
    INSERT INTO itineraries VALUES ('${id(4)}','d','Private','Seoul',2,8,NULL,'2026-10-06T00:00:00Z',0,NULL);
    INSERT INTO itineraries VALUES ('${id(5)}','e','Bad code','Seoul',2,8,NULL,'2026-10-07T00:00:00Z',1,'BAD CODE');
    INSERT INTO itineraries VALUES ('${id(6)}','f','Pct','100% Seoul',2,1,NULL,'2026-08-01T00:00:00Z',1,'mnop3456');
    INSERT INTO legacy_itinerary_media VALUES ('${id(2)}', 50);
    INSERT INTO preview_itinerary_likes VALUES ('x','${id(3)}'),('y','${id(3)}');`);
  mocks.reader.mockReturnValue(db);
}
afterEach(() => { db?.sqlite.close(); vi.clearAllMocks(); });

describe("preview explore", () => {
  it("lists only shared rows with a valid share code, newest first, without creator data", async () => {
    database();
    const rows = await previewPublicItineraries();
    expect(rows.map((row) => row.title)).toEqual(["Tokyo day", "Seoul eats", "Seoul long", "Pct"]);
    expect(rows[1]).toEqual({ id: id(1), title: "Seoul eats", city: "Seoul", days: 2, localScore: 7,
      highlights: ["Markets"], shareCode: "abcd1234", createdAt: "2026-10-01T00:00:00Z", viewCount: 0,
      likeCount: 0, creatorName: null, creatorAvatar: null });
  });

  it("applies the city, duration and sort filters like the Supabase page", async () => {
    database();
    expect((await previewPublicItineraries("seoul")).map((row) => row.title)).toEqual(["Seoul eats", "Seoul long", "Pct"]);
    expect((await previewPublicItineraries("all", "8+")).map((row) => row.title)).toEqual(["Seoul long"]);
    expect((await previewPublicItineraries(undefined, "2-3")).map((row) => row.days)).toEqual([2, 2]);
    expect((await previewPublicItineraries(undefined, undefined, "popular"))[0].title).toBe("Seoul long");
    expect((await previewPublicItineraries(undefined, undefined, "likes"))[0]).toMatchObject({ title: "Tokyo day", likeCount: 2 });
    expect((await previewPublicItineraries(undefined, undefined, "score"))[0].title).toBe("Seoul long");
    expect((await previewPublicItineraries(undefined, undefined, "1; DROP TABLE x"))[0].title).toBe("Tokyo day");
  });

  it("treats the city text literally, never as a LIKE pattern", async () => {
    database();
    expect((await previewPublicItineraries("%")).map((row) => row.title)).toEqual(["Pct"]);
    expect(await previewPublicItineraries("_")).toEqual([]);
    expect(await previewPublicItineraries("x".repeat(81))).toEqual([]);
  });

  it("ranks popular cities among shared rows only", async () => {
    database();
    expect(await previewPopularCities()).toEqual(["Seoul", "100% Seoul", "Tokyo"]);
  });

  it("rejects malformed highlights", async () => {
    database();
    db.sqlite.exec(`UPDATE itineraries SET highlights = '{"a":1}' WHERE id = '${id(1)}'`);
    await expect(previewPublicItineraries()).rejects.toThrow("Invalid preview explore row");
  });
});

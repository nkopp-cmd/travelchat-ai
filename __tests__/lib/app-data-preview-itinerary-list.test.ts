// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewItineraryListCandidate, previewItineraryList } from "@/lib/app-data/preview-itinerary-list";

const environment = process.env;
const one = "550e8400-e29b-41d4-a716-446655440000";
const two = "550e8400-e29b-41d4-a716-446655440001";
const other = "550e8400-e29b-41d4-a716-446655440002";
const mismatched = "550e8400-e29b-41d4-a716-446655440003";
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("preview itinerary list", () => {
  it("requires the exact preview host, flag and isolation settings", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    expect(isPreviewItineraryListCandidate("localley-next-preview.nkopp.workers.dev", "d1")).toBe(true);
    expect(isPreviewItineraryListCandidate("www.localley.io", "d1")).toBe(false);
    expect(isPreviewItineraryListCandidate("localley-next-preview.nkopp.workers.dev", undefined)).toBe(false);
    process.env.SUPABASE_READ_ONLY = "false";
    expect(isPreviewItineraryListCandidate("localley-next-preview.nkopp.workers.dev", "d1")).toBe(false);
  });

  it("selects exact legacy and fresh rows, excluding foreign and mismatched owners", async () => {
    const db = new D1Sqlite();
    try {
      db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT NOT NULL);
        CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT NOT NULL);
        CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, title TEXT,
          subtitle TEXT, city TEXT, days INTEGER, local_score REAL, created_at TEXT,
          status TEXT, is_favorite INTEGER);
        INSERT INTO owners VALUES ('user_one','legacy-fixture'),('auth:user_one','new'),
          ('user_two','legacy-fixture'),('wrong_owner','legacy-fixture');
        INSERT INTO legacy_owners VALUES ('user_one','user_one'),('user_two','user_two'),
          ('wrong_owner','user_one');
        INSERT INTO itineraries VALUES ('${one}','user_one','Legacy',NULL,'Seoul',2,NULL,
          '2026-09-29T00:00:00Z',NULL,1);
        INSERT INTO itineraries VALUES ('${two}','auth:user_one','Fresh','note','Tokyo',1,7,
          '2026-09-30T00:00:00Z','draft',0);
        INSERT INTO itineraries VALUES ('${other}','user_two','Foreign',NULL,'Busan',1,5,
          '2026-09-30T00:00:00Z',NULL,0);
        INSERT INTO itineraries VALUES ('${mismatched}','wrong_owner','Mismatched',NULL,'Seoul',1,5,
          '2026-09-30T00:00:00Z',NULL,0);`);
      mocks.reader.mockReturnValue(db);
      expect(await previewItineraryList("user_one")).toEqual([
        { id: two, title: "Fresh", subtitle: "note", city: "Tokyo", days: 1,
          local_score: 7, created_at: "2026-09-30T00:00:00Z", status: "draft", is_favorite: false },
        { id: one, title: "Legacy", subtitle: undefined, city: "Seoul", days: 2,
          local_score: 0, created_at: "2026-09-29T00:00:00Z", status: undefined, is_favorite: true },
      ]);
      expect((await previewItineraryList("user_two")).map(row => row.id)).toEqual([other]);
      expect(await previewItineraryList("unknown_user")).toEqual([]);
    } finally {
      db.sqlite.close();
    }
  });

  it("rejects malformed and oversized history", async () => {
    const base = { id: one, title: "Seoul", subtitle: null, city: "Seoul", days: 1,
      local_score: 5, created_at: "2026-09-30T00:00:00Z", status: null, is_favorite: 0 };
    const all = vi.fn().mockResolvedValueOnce({ results: [{ ...base, title: null }] })
      .mockResolvedValueOnce({ results: Array.from({ length: 101 }, () => base) });
    mocks.reader.mockReturnValue({ prepare: () => ({ bind: () => ({ all }) }) });
    await expect(previewItineraryList("user_one")).rejects.toThrow("Invalid preview itinerary list row");
    await expect(previewItineraryList("user_one")).rejects.toThrow("Preview itinerary list unavailable");
  });
});

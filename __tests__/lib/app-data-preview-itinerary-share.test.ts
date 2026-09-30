// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { getPreviewSharedItinerary, isPreviewItineraryShareCandidate,
  setPreviewItineraryShare } from "@/lib/app-data/preview-itinerary-share";

const id = "11111111-1111-4111-8111-111111111111";
let db: D1Sqlite;
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT UNIQUE);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, title TEXT, city TEXT,
      days INTEGER, activities TEXT, highlights TEXT, estimated_cost TEXT, local_score REAL,
      created_at TEXT, shared INTEGER NOT NULL DEFAULT 0, share_code TEXT);
    CREATE UNIQUE INDEX itineraries_share_code ON itineraries(share_code) WHERE share_code IS NOT NULL;
    CREATE TABLE legacy_itinerary_media(itineraryId TEXT PRIMARY KEY, storySlides TEXT);
    INSERT INTO owners VALUES ('auth:owner','new'), ('legacy','legacy-fixture');
    INSERT INTO legacy_owners VALUES ('legacy','legacy');
    INSERT INTO itineraries VALUES ('${id}','auth:owner','Seoul day','Seoul',1,
      '[{"day":1,"activities":[]}]','["Market"]',null,4,'2026-09-30T00:00:00Z',0,null);`);
  mocks.reader.mockReturnValue(db);
});
afterEach(() => { db.sqlite.close(); vi.clearAllMocks(); });

describe("preview itinerary sharing", () => {
  it("requires the exact isolated preview host and candidate flag", () => {
    vi.stubEnv("AUTH_MAIL_MODE", "outbox");
    vi.stubEnv("SUPABASE_READ_ONLY", "true");
    const path = `/api/itineraries/${id}/share`;
    expect(isPreviewItineraryShareCandidate(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}?data_candidate=d1`))).toBe(true);
    expect(isPreviewItineraryShareCandidate(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}`))).toBe(false);
    expect(isPreviewItineraryShareCandidate(new NextRequest(`https://www.localley.io${path}?data_candidate=d1`))).toBe(false);
    vi.stubEnv("SUPABASE_READ_ONLY", "false");
    expect(isPreviewItineraryShareCandidate(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}?data_candidate=d1`))).toBe(false);
    vi.unstubAllEnvs();
  });
  it("shares, reads public content, repeats safely, and unshares", async () => {
    const first = await setPreviewItineraryShare(id, "owner", true);
    expect(first.state).toBe("found");
    if (first.state !== "found") return;
    expect(first.code).toMatch(/^[a-z0-9]{8}$/);
    expect(await setPreviewItineraryShare(id, "owner", true)).toEqual(first);
    expect(await getPreviewSharedItinerary(first.code!)).toMatchObject({
      title: "Seoul day", highlights: ["Market"], activities: [{ day: 1, activities: [] }],
    });
    expect(await setPreviewItineraryShare(id, "owner", false)).toEqual({ state: "found", code: null });
    expect(await getPreviewSharedItinerary(first.code!)).toBeNull();
  });

  it("rejects foreign, missing, and malformed IDs without writing", async () => {
    expect(await setPreviewItineraryShare(id, "other", true)).toEqual({ state: "forbidden" });
    expect(await setPreviewItineraryShare("bad", "owner", true)).toEqual({ state: "missing" });
    expect(await setPreviewItineraryShare("22222222-2222-4222-8222-222222222222", "owner", true))
      .toEqual({ state: "missing" });
    expect(db.sqlite.prepare("SELECT shared, share_code FROM itineraries WHERE id=?").get(id))
      .toEqual({ shared: 0, share_code: null });
  });

  it("recognizes the exact imported owner and rejects a fresh alias", async () => {
    db.sqlite.exec(`INSERT INTO itineraries VALUES ('22222222-2222-4222-8222-222222222222',
      'legacy','Old','Paris',1,'[]',null,null,3,'2026-01-01T00:00:00Z',0,null)`);
    expect((await setPreviewItineraryShare("22222222-2222-4222-8222-222222222222", "legacy", true)).state)
      .toBe("found");
    expect(await setPreviewItineraryShare("22222222-2222-4222-8222-222222222222", "other", true))
      .toEqual({ state: "forbidden" });
  });

  it("does not expose malformed stored plans", async () => {
    db.sqlite.prepare("UPDATE itineraries SET shared=1, share_code='deadbeef', activities='null' WHERE id=?").run(id);
    await expect(getPreviewSharedItinerary("deadbeef")).rejects.toThrow("Invalid preview shared itinerary");
    expect(await getPreviewSharedItinerary("BAD")).toBeNull();
  });
});

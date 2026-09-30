// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.currentUser }));
import { addPreviewItineraryLike, assertPreviewLikeUser, isPreviewItineraryLikeCandidate,
  previewLikeStatus, previewSavedItineraries, removePreviewItineraryLike } from "@/lib/app-data/preview-itinerary-likes";

const sharedId = "11111111-1111-4111-8111-111111111111";
const privateId = "22222222-2222-4222-8222-222222222222";
let db: D1Sqlite;
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT UNIQUE);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES owners(id),
      title TEXT, city TEXT, days INTEGER, activities TEXT, local_score REAL, share_code TEXT,
      created_at TEXT, shared INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE legacy_itinerary_media(itineraryId TEXT PRIMARY KEY, isPublic INTEGER,
      viewCount INTEGER, likeCount INTEGER);
    INSERT INTO owners VALUES ('auth:creator','new'),('auth:other','new');
    INSERT INTO itineraries VALUES ('${sharedId}','auth:creator','Seoul day','Seoul',1,'[]',5,'deadbeef',
      '2026-09-30T00:00:00Z',1),('${privateId}','auth:creator','Private','Seoul',1,'[]',4,null,
      '2026-09-30T00:00:00Z',0);`);
  db.sqlite.exec(readFileSync(path.resolve(__dirname,
    "../../migrations/app-preview/0022_preview_itinerary_likes.sql"), "utf8"));
  mocks.reader.mockReturnValue(db);
  mocks.currentUser.mockResolvedValue({ id: "liker", emailVerified: true,
    primaryEmailAddress: { emailAddress: "liker@preview.localley.test" } });
});
afterEach(() => { db.sqlite.close(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("preview itinerary likes", () => {
  it("requires the exact preview candidate host and isolated flags", () => {
    vi.stubEnv("AUTH_MAIL_MODE", "outbox");
    vi.stubEnv("SUPABASE_READ_ONLY", "true");
    const path = `/api/itineraries/${sharedId}/like?data_candidate=d1`;
    expect(isPreviewItineraryLikeCandidate(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}`))).toBe(true);
    expect(isPreviewItineraryLikeCandidate(new NextRequest(`https://www.localley.io${path}`))).toBe(false);
    expect(isPreviewItineraryLikeCandidate(new NextRequest(`https://localley-next-preview.nkopp.workers.dev/api/itineraries/${sharedId}/like`))).toBe(false);
    vi.stubEnv("SUPABASE_READ_ONLY", "false");
    expect(isPreviewItineraryLikeCandidate(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}`))).toBe(false);
  });

  it("admits only verified reserved preview users without legacy owners", async () => {
    await expect(assertPreviewLikeUser("liker")).resolves.toBeUndefined();
    await expect(assertPreviewLikeUser("other")).rejects.toThrow();
    mocks.currentUser.mockResolvedValueOnce({ id: "liker", emailVerified: false,
      primaryEmailAddress: { emailAddress: "liker@preview.localley.test" } });
    await expect(assertPreviewLikeUser("liker")).rejects.toThrow();
    db.sqlite.exec("INSERT INTO owners VALUES ('liker','legacy-fixture'); INSERT INTO legacy_owners VALUES ('liker','liker')");
    await expect(assertPreviewLikeUser("liker")).rejects.toThrow();
  });

  it("creates one like, isolates readers, lists the save, and removes it", async () => {
    expect(await previewLikeStatus("liker", sharedId)).toEqual({ liked: false, likeCount: 0 });
    expect(await addPreviewItineraryLike("liker", sharedId)).toMatchObject({ state: "found", liked: true, likeCount: 1, duplicate: false });
    expect(await addPreviewItineraryLike("liker", sharedId)).toMatchObject({ state: "found", liked: true, likeCount: 1, duplicate: true });
    expect(await previewLikeStatus("other", sharedId)).toEqual({ liked: false, likeCount: 1 });
    expect(await previewSavedItineraries("liker")).toMatchObject({ itineraries: [{
      id: sharedId, title: "Seoul day", likeCount: 1, shareCode: "deadbeef", creatorName: null,
    }] });
    expect(await previewSavedItineraries("other")).toEqual({ itineraries: [] });
    expect(await removePreviewItineraryLike("other", sharedId)).toEqual({ liked: false, likeCount: 1 });
    expect(await removePreviewItineraryLike("liker", sharedId)).toEqual({ liked: false, likeCount: 0 });
    expect(await previewSavedItineraries("liker")).toEqual({ itineraries: [] });
  });

  it("blocks own, private, missing, and malformed itinerary writes", async () => {
    expect(await addPreviewItineraryLike("creator", sharedId)).toEqual({ state: "own" });
    expect(await addPreviewItineraryLike("liker", privateId)).toEqual({ state: "private" });
    expect(await addPreviewItineraryLike("liker", "bad")).toEqual({ state: "missing" });
    expect(await addPreviewItineraryLike("liker", "33333333-3333-4333-8333-333333333333"))
      .toEqual({ state: "missing" });
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_itinerary_likes").get()).toEqual({ n: 0 });
  });

  it("hides an unshared save from the list while retaining its owner link", async () => {
    await addPreviewItineraryLike("liker", sharedId);
    db.sqlite.prepare("UPDATE itineraries SET shared=0 WHERE id=?").run(sharedId);
    expect(await previewSavedItineraries("liker")).toEqual({ itineraries: [] });
    expect(await previewLikeStatus("liker", sharedId)).toEqual({ liked: true, likeCount: 1 });
  });
});

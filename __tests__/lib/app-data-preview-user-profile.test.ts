// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { previewUserProfile } from "@/lib/app-data/preview-user-profile";

const uuid = (n: number) => `550e8400-e29b-41d4-a716-44665544000${n}`;
let db: D1Sqlite;
function database() {
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE profiles(id TEXT PRIMARY KEY, ownerId TEXT);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT);
    CREATE TABLE legacy_profile_stats(profileId TEXT PRIMARY KEY, username TEXT, xp INTEGER, level INTEGER, title TEXT, createdAt TEXT);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT, title TEXT, city TEXT, days INTEGER, local_score REAL, created_at TEXT, shared INTEGER, share_code TEXT);
    CREATE TABLE legacy_itinerary_media(itineraryId TEXT PRIMARY KEY, viewCount INTEGER NOT NULL DEFAULT 0);
    INSERT INTO profiles VALUES ('p1','user_one'),('p2','user_two'),('p3','user_three');
    INSERT INTO legacy_owners VALUES ('user_one','user_one'),('user_two','user_two'),('user_three','user_three');
    INSERT INTO legacy_profile_stats VALUES ('p1','mina',120,3,'Explorer','2025-11-26'),('p2','jun',NULL,NULL,NULL,NULL),('p3','jun',5,1,NULL,NULL);
    INSERT INTO itineraries VALUES ('${uuid(1)}','user_one','Seoul eats','Seoul',2,7,'2026-10-02',1,'abcd1234');
    INSERT INTO itineraries VALUES ('${uuid(2)}','user_one','Private','Seoul',1,5,'2026-10-03',0,NULL);
    INSERT INTO itineraries VALUES ('${uuid(3)}','user_one','Bad code','Tokyo',1,5,'2026-10-04',1,'BAD CODE');
    INSERT INTO itineraries VALUES ('${uuid(4)}','user_two','Other owner','Busan',1,5,'2026-10-05',1,'efgh5678');
    INSERT INTO legacy_itinerary_media VALUES ('${uuid(1)}',40),('${uuid(2)}',99),('${uuid(3)}',2);`);
  mocks.reader.mockReturnValue(db);
}
afterEach(() => { db?.sqlite.close(); vi.clearAllMocks(); });

describe("preview user profile", () => {
  it("finds a profile by exact username with only its shared itineraries and owner stats", async () => {
    database();
    const result = await previewUserProfile("mina");
    expect(result?.profile).toEqual({ id: "p1", clerkId: "user_one", name: null, username: "mina", avatarUrl: null, bio: null,
      level: 3, totalXp: 120, title: "Explorer", joinedAt: "2025-11-26" });
    expect(result?.itineraries.map((item) => item.title)).toEqual(["Seoul eats"]);
    expect(result?.itineraries[0]).toMatchObject({ shareCode: "abcd1234", viewCount: 40, localScore: 7 });
    expect(result?.stats).toEqual({ totalItineraries: 3, sharedItineraries: 2, totalViews: 42 });
  });

  it("falls back to the exact user id and keeps defaults for empty stats", async () => {
    database();
    db.sqlite.exec("UPDATE legacy_profile_stats SET username = 'kim' WHERE profileId = 'p3'");
    const result = await previewUserProfile("user_two");
    expect(result?.profile).toMatchObject({ clerkId: "user_two", username: "jun", level: 1, totalXp: 0, title: "Tourist" });
    expect(result?.itineraries.map((item) => item.title)).toEqual(["Other owner"]);
  });

  it("fails closed on duplicate usernames and rejects filter syntax before any query", async () => {
    database();
    expect(await previewUserProfile("jun")).toBeNull();
    mocks.reader.mockClear();
    for (const segment of ["x,email.eq.a@b.co", "a)", "mina.eq", "", "a".repeat(65)]) expect(await previewUserProfile(segment)).toBeNull();
    expect(mocks.reader).not.toHaveBeenCalled();
    expect(await previewUserProfile("nobody")).toBeNull();
  });
});

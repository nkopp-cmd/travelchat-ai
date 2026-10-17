// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
import { duplicatePreviewItinerary } from "@/lib/app-data/preview-itinerary-duplicate";
import { PreviewEditorDeniedError } from "@/lib/app-data/preview-itinerary-editor";
const id = "00000000-0000-4000-8000-000000000021";
const missing = "00000000-0000-4000-8000-000000000022";
const activities = { dailyPlans: [{ day: 1, activities: [{ name: "Tea house", lat: 37.57, lng: 126.98,
  custom: { kept: true }, cost: "$10" }] }], insights: [{ text: "Keep this note" }] };
let db: D1Sqlite;
const rows = () => db.sqlite.prepare("SELECT * FROM itineraries ORDER BY id").all();
beforeEach(() => {
  db = new D1Sqlite();
  for (const file of readdirSync("migrations/app-preview").filter(f => f.endsWith(".sql")).sort()) {
    db.sqlite.exec(readFileSync("migrations/app-preview/" + file, "utf8"));
  }
  db.sqlite.exec("INSERT INTO owners VALUES('auth:a','new'),('auth:b','new')");
  db.sqlite.prepare(`INSERT INTO itineraries(id,ownerId,title,subtitle,city,days,activities,
    highlights,estimated_cost,local_score,status,is_favorite,shared,share_code,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,"auth:a","Tea route","Keep subtitle","Seoul",1,
      JSON.stringify(activities),'["Quiet lanes"]',"$50",6,"published",1,1,"abcd1234","2026-01-01T00:00:00Z");
  db.sqlite.prepare(`INSERT INTO legacy_itinerary_media(itineraryId,isPublic,viewCount,sourceProfileId,aiBackgrounds,storySlides)
    VALUES(?,1,42,'profile','{"cover":"https://private.test/image"}','{}')`).run(id);
  mocks.reader.mockReturnValue(db);
  mocks.user.mockResolvedValue({ id: "a", emailVerified: true, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } });
});
afterEach(() => { db.sqlite.close(); vi.clearAllMocks(); });
describe("candidate owned itinerary duplication", () => {
  it("copies exact content into one new private draft and retains the original and media", async () => {
    const before = rows();
    const media = db.sqlite.prepare("SELECT * FROM legacy_itinerary_media").all();
    const result = await duplicatePreviewItinerary(id.toUpperCase(), "a");
    expect(result.state).toBe("found");
    if (result.state !== "found") throw Error("missing copy");
    expect(result.itinerary).toMatchObject({ title: "Tea route (Copy)", subtitle: "Keep subtitle",city: "Seoul",
      days: 1, activities, highlights: ["Quiet lanes"], estimated_cost: "$50",local_score: 6,
      clerk_user_id: "a",status: "draft",is_favorite: false,shared: false,share_code: null,
      is_public: false,like_count: 0,view_count: 0,source_profile_id: null,ai_backgrounds: null,story_slides: null });
    expect(result.itinerary.id).not.toBe(id);
    expect(Date.parse(result.itinerary.created_at as string)).toBeGreaterThan(Date.parse("2026-01-01"));
    expect(rows()).toHaveLength(2);
    expect(db.sqlite.prepare("SELECT * FROM itineraries WHERE id=?").get(id)).toEqual(before[0]);
    expect(db.sqlite.prepare("SELECT * FROM legacy_itinerary_media").all()).toEqual(media);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM owners").get()).toEqual({ n: 2 });
  });
  it("rejects missing and invalid IDs without writes", async () => {
    const before = rows();
    expect(await duplicatePreviewItinerary("../bad", "a")).toEqual({ state: "missing" });
    expect(await duplicatePreviewItinerary(missing, "a")).toEqual({ state: "missing" });
    expect(rows()).toEqual(before);
  });
  it.each(["private", "shared", "public"])("refuses a foreign %s trip without copying its content", async mode => {
    db.sqlite.exec(`UPDATE itineraries SET shared=${mode === "shared" ? 1 : 0};
      UPDATE legacy_itinerary_media SET isPublic=${mode === "public" ? 1 : 0}`);
    mocks.user.mockResolvedValue({ id: "b", emailVerified: true,primaryEmailAddress: { emailAddress: "b@preview.localley.test" } });
    const before = rows();
    expect(await duplicatePreviewItinerary(id, "b")).toEqual({ state: "forbidden" });
    expect(rows()).toEqual(before);
  });
  it.each([null,{ id: "b",emailVerified: true,primaryEmailAddress: { emailAddress: "a@preview.localley.test" } },
    { id: "a",emailVerified: false,primaryEmailAddress: { emailAddress: "a@preview.localley.test" } },
    { id: "a",emailVerified: true,primaryEmailAddress: { emailAddress: "a@example.com" } }])("denies unverified or non-reserved identities", async user => {
    mocks.user.mockResolvedValue(user);const before=rows();
    await expect(duplicatePreviewItinerary(id,"a")).rejects.toBeInstanceOf(PreviewEditorDeniedError);
    expect(rows()).toEqual(before);
  });
  it("refuses a fresh owner with an imported identity mapping", async () => {
    db.sqlite.exec(`INSERT INTO legacy_import_batches(id,manifestSha256,projectionSha256,counts)
      VALUES('${"a".repeat(64)}','${"b".repeat(64)}','${"c".repeat(64)}','{}');
      INSERT INTO owners VALUES('legacy-a','legacy-fixture');
      INSERT INTO legacy_owners VALUES('legacy-a','a',1,'${"a".repeat(64)}');`);
    const before = rows();
    await expect(duplicatePreviewItinerary(id,"a")).rejects.toBeInstanceOf(PreviewEditorDeniedError);
    expect(rows()).toEqual(before);
  });
  it("rechecks ownership inside the insert after a concurrent ownership change", async () => {
    const prepare = db.prepare.bind(db);
    vi.spyOn(db,"prepare").mockImplementation(sql => {
      if (sql.startsWith("INSERT INTO itineraries")) db.sqlite.prepare("UPDATE itineraries SET ownerId='auth:b' WHERE id=?").run(id);
      return prepare(sql);
    });
    expect(await duplicatePreviewItinerary(id,"a")).toEqual({ state: "forbidden" });
    expect(rows()).toHaveLength(1);
  });
  it("propagates D1 failure without creating any Source or partial media state", async () => {
    const prepare = db.prepare.bind(db); const before = rows();
    vi.spyOn(db,"prepare").mockImplementation(sql => {
      if (sql.startsWith("INSERT INTO itineraries")) throw Error("D1 unavailable");
      return prepare(sql);
    });
    await expect(duplicatePreviewItinerary(id,"a")).rejects.toThrow("D1 unavailable");
    expect(rows()).toEqual(before);
  });
});

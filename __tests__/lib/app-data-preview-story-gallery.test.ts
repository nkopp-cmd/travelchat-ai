// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
import { previewStoryGallery } from "@/lib/app-data/preview-story-gallery";
let db: D1Sqlite;
const id = "11111111-1111-4111-8111-111111111111";
const generation = "22222222-2222-4222-8222-222222222222";
const story = () => ({ generated_at: "2026-10-01T00:00:00Z", expires_at: "2099-10-04T00:00:00Z", tier: "free",
  slides: { cover: `r2://story-slides/${id}/${generation}/cover.png` } });
const update = (value: unknown) => db.sqlite.prepare('UPDATE legacy_itinerary_media SET storySlides=?').run(JSON.stringify(value));
beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT); CREATE TABLE legacy_owners(ownerId TEXT,clerkUserId TEXT);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY,ownerId TEXT,title TEXT,city TEXT,days INTEGER);
    CREATE TABLE legacy_itinerary_media(itineraryId TEXT PRIMARY KEY,storySlides TEXT);
    INSERT INTO owners VALUES('auth:a','new'),('auth:b','new');
    INSERT INTO itineraries VALUES('${id}','auth:a','Owned gallery','Seoul',1);
    INSERT INTO legacy_itinerary_media VALUES('${id}',NULL);`);
  mocks.reader.mockReturnValue(db);
  mocks.user.mockResolvedValue({ id: "a", emailVerified: true, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } });
});
afterEach(() => { db.sqlite.close(); vi.clearAllMocks(); });
describe("fresh stored story gallery", () => {
  it("reads only owned metadata and maps exact R2 keys to authenticated candidate URLs", async () => {
    update(story());
    const result = await previewStoryGallery(id,"a");
    expect(result).toMatchObject({ title: "Owned gallery", days: 1, expired: false, story_slides: { slides: {
      cover: `https://localley-next-preview.nkopp.workers.dev/api/itineraries/${id}/story/media/${generation}/cover?data_candidate=d1&gallery_candidate=fresh`,
    } } });
  });
  it("returns truthful empty and expired states without media links", async () => {
    expect((await previewStoryGallery(id,"a"))?.story_slides).toBeNull();
    update({ ...story(), expires_at: "2026-10-02T00:00:00Z" });
    expect(await previewStoryGallery(id,"a")).toMatchObject({ expired: true, story_slides: null });
    update({ ...story(), slides: {} });
    expect((await previewStoryGallery(id,"a"))?.story_slides).toBeNull();
  });
  it("refuses anonymous, foreign, missing and invalid IDs", async () => {
    expect(await previewStoryGallery(id,null)).toBeNull();
    expect(mocks.reader).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ id: "b", emailVerified: true, primaryEmailAddress: { emailAddress: "b@preview.localley.test" } });
    expect(await previewStoryGallery(id,"b")).toBeNull();
    expect(await previewStoryGallery("00000000-0000-4000-8000-000000000000","b")).toBeNull();
    expect(await previewStoryGallery("../foreign","b")).toBeNull();
  });
  it("refuses real, unverified, mismatched and conflicting historical owners", async () => {
    for (const user of [{ id: "a", emailVerified: true, primaryEmailAddress: { emailAddress: "real@example.com" } },
      { id: "a", emailVerified: false, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } },
      { id: "b", emailVerified: true, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } }]) {
      mocks.user.mockResolvedValue(user); expect(await previewStoryGallery(id,"a")).toBeNull();
    }
    expect(mocks.reader).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ id: "a", emailVerified: true, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } });
    db.sqlite.exec("INSERT INTO owners VALUES('legacy-a','legacy-fixture'); INSERT INTO legacy_owners VALUES('legacy-a','a')");
    expect(await previewStoryGallery(id,"a")).toBeNull();
  });
  it("refuses source, foreign, mismatched, excessive and malformed metadata", async () => {
    for (const slides of [{ cover: "https://source.example/cover.png" },
      { cover: `r2://story-slides/00000000-0000-4000-8000-000000000000/${generation}/cover.png` },
      { cover: `r2://story-slides/${id}/${generation}/day1.png` },
      { day2: `r2://story-slides/${id}/${generation}/day2.png` },
      { bad: "r2://bad" }]) {
      update({ ...story(), slides }); await expect(previewStoryGallery(id,"a")).rejects.toThrow();
    }
    for (const value of [null, [], { ...story(), expires_at: "invalid" }, { ...story(), tier: "admin" },
      { ...story(), generated_at: "2100-01-01T00:00:00Z" }, { ...story(), slides: [] }]) {
      update(value); await expect(previewStoryGallery(id,"a")).rejects.toThrow();
    }
    db.sqlite.prepare('UPDATE legacy_itinerary_media SET storySlides=?').run('x'.repeat(16385));
    await expect(previewStoryGallery(id,"a")).rejects.toThrow();
  });
});

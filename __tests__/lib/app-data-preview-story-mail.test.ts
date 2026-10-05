// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn(), head: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user }));
import { queuePreviewStoryMail } from "@/lib/app-data/preview-story-mail";
const symbol = Symbol.for("__cloudflare-context__");
const environment = process.env;
const id = "00000000-0000-4000-8000-000000000001";
let db: D1Sqlite;
let outbox: D1Sqlite;
const generation = "00000000-0000-4000-8000-000000000003";
const story = () => ({ generated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(),
  tier: "free", slides: Object.fromEntries(["cover", "day1", "summary"].map(slide =>
    [slide, `r2://story-slides/${id}/${generation}/${slide}.png`])) });
const metadata = (value: unknown) => db.sqlite.prepare("UPDATE legacy_itinerary_media SET storySlides=?").run(value === null ? null : JSON.stringify(value));
beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true",
    BETTER_AUTH_URL: "https://localley-next-preview.nkopp.workers.dev" };
  db = new D1Sqlite(); outbox = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners(id TEXT PRIMARY KEY, source TEXT);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY, clerkUserId TEXT);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY, ownerId TEXT, title TEXT, city TEXT, days INTEGER);
    CREATE TABLE legacy_itinerary_media(itineraryId TEXT PRIMARY KEY, storySlides TEXT);
    INSERT INTO owners VALUES('auth:a','new'),('auth:b','new');
    INSERT INTO itineraries VALUES('${id}','auth:a','Owned','Seoul',1);
    INSERT INTO legacy_itinerary_media VALUES('${id}',NULL);`);
  outbox.sqlite.exec(`CREATE TABLE auth_mail_outbox(id INTEGER PRIMARY KEY, kind TEXT,email TEXT,url TEXT,createdAt INTEGER);`);
  metadata(story());
  mocks.head.mockImplementation(async (key: string) => ({ key, size: 100, httpMetadata: { contentType: "image/png" } }));
  mocks.reader.mockReturnValue(db);
  mocks.user.mockResolvedValue({ id: "a", emailVerified: true,
    primaryEmailAddress: { emailAddress: "A@preview.localley.test" } });
  Object.assign(globalThis, { [symbol]: { env: { AUTH_DB: outbox, STORY_PREVIEW_MEDIA: { head: mocks.head }, AUTH_EMAIL: { send: () => { throw new Error("No provider calls"); } } } } });
});
afterEach(() => { db.sqlite.close(); outbox.sqlite.close(); process.env = environment;
  Reflect.deleteProperty(globalThis, symbol); vi.clearAllMocks(); });
const count = () => outbox.sqlite.prepare("SELECT count(*) AS n FROM auth_mail_outbox").get().n;

describe("candidate story outbox", () => {
  it("queues only session recipient and canonical candidate itinerary link in the real SQL outbox", async () => {
    expect(await queuePreviewStoryMail("a", id.toUpperCase())).toBe(true);
    const row = outbox.sqlite.prepare("SELECT * FROM auth_mail_outbox").get();
    expect(row).toMatchObject({ kind: "story-ready", email: "a@preview.localley.test",
      url: `https://localley-next-preview.nkopp.workers.dev/itineraries/${id}/stories?data_candidate=d1` });
    expect(row.createdAt).toBeGreaterThan(0);
  });
  it("refuses a second owner and missing itinerary without writing", async () => {
    mocks.user.mockResolvedValue({ id: "b", emailVerified: true,
      primaryEmailAddress: { emailAddress: "b@preview.localley.test" } });
    expect(await queuePreviewStoryMail("b", id)).toBe(false);
    expect(await queuePreviewStoryMail("b", "00000000-0000-4000-8000-000000000002")).toBe(false);
    expect(count()).toBe(0);
  });
  it("refuses legacy or conflicting identity even when a fresh itinerary exists", async () => {
    db.sqlite.exec("INSERT INTO owners VALUES('legacy-a','legacy-fixture'); INSERT INTO legacy_owners VALUES('legacy-a','a')");
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("Historical");
    expect(count()).toBe(0);
  });
  it("refuses real, malformed, oversized, unverified and mismatched recipients", async () => {
    for (const user of [
      { id: "a", emailVerified: false, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } },
      { id: "b", emailVerified: true, primaryEmailAddress: { emailAddress: "a@preview.localley.test" } },
      ...["real@example.com", "x\n@preview.localley.test", `${"a".repeat(200)}@preview.localley.test`, "x@evil@preview.localley.test"]
        .map(emailAddress => ({ id: "a", emailVerified: true, primaryEmailAddress: { emailAddress } })),
    ]) { mocks.user.mockResolvedValue(user); await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("recipient"); }
    expect(count()).toBe(0);
  });
  it("fails closed for missing outbox, invalid ID and production auth URL", async () => {
    Object.assign(globalThis, { [symbol]: { env: { STORY_PREVIEW_MEDIA: { head: mocks.head } } } });
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("database");
    await expect(queuePreviewStoryMail("a", "../../other")).rejects.toThrow("ID");
    process.env.BETTER_AUTH_URL = "https://www.localley.io";
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("outbox");
    expect(count()).toBe(0);
  });
  it("refuses missing, partial, expired and mixed-generation metadata without R2 reads or outbox writes", async () => {
    for (const value of [null, { ...story(), slides: { cover: story().slides.cover } },
      { ...story(), expires_at: new Date(Date.now() - 1000).toISOString(), generated_at: "2026-01-01T00:00:00Z" },
      { ...story(), slides: { ...story().slides, day1: story().slides.day1.replace(generation, id) } }]) {
      metadata(value); expect(await queuePreviewStoryMail("a", id)).toBe(false);
    }
    expect(mocks.head).not.toHaveBeenCalled(); expect(count()).toBe(0);
  });
  it("refuses absent, foreign, empty, oversized and non-PNG R2 objects", async () => {
    for (const result of [null, { key: "other", size: 100, httpMetadata: { contentType: "image/png" } },
      { size: 0 }, { size: 2097153 }, { size: 100, httpMetadata: { contentType: "image/webp" } }]) {
      mocks.head.mockImplementation(async (key: string) => result && ({ key, ...result }));
      expect(await queuePreviewStoryMail("a", id)).toBe(false);
    }
    expect(count()).toBe(0);
  });
  it("fails closed for malformed references or unavailable R2 without fallback", async () => {
    metadata({ ...story(), slides: { ...story().slides, cover: "https://source.test/private.png" } });
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow(); expect(mocks.head).not.toHaveBeenCalled();
    metadata(story()); mocks.head.mockRejectedValue(new Error("Private provider message"));
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow(); expect(count()).toBe(0);
  });
  it("refuses metadata expired during object checks", async () => {
    mocks.head.mockImplementation(async (key: string) => {
      metadata({ ...story(), generated_at: "2026-01-01T00:00:00Z", expires_at: "2026-01-02T00:00:00Z" });
      return { key, size: 100, httpMetadata: { contentType: "image/png" } };
    });
    expect(await queuePreviewStoryMail("a", id)).toBe(false); expect(count()).toBe(0);
  });
  it("checks each expected object and refuses an incomplete day sequence", async () => {
    expect(await queuePreviewStoryMail("a", id)).toBe(true); expect(mocks.head.mock.calls.map(c => c[0])).toEqual(
      ["cover", "day1", "summary"].map(slide => `story-slides/${id}/${generation}/${slide}.png`));
    outbox.sqlite.exec("DELETE FROM auth_mail_outbox"); db.sqlite.exec("UPDATE itineraries SET days=2");
    mocks.head.mockClear(); expect(await queuePreviewStoryMail("a", id)).toBe(false);
    expect(mocks.head).not.toHaveBeenCalled(); expect(count()).toBe(0);
  });

  it("refuses unavailable binding, changed generation and outbox write failure", async () => {
    Object.assign(globalThis, { [symbol]: { env: { AUTH_DB: outbox } } });
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow("storage unavailable");
    expect(count()).toBe(0);
    Object.assign(globalThis, { [symbol]: { env: { AUTH_DB: outbox, STORY_PREVIEW_MEDIA: { head: mocks.head } } } });
    mocks.head.mockImplementation(async (key: string) => {
      metadata({ ...story(), slides: Object.fromEntries(Object.entries(story().slides).map(([k,v]) => [k,v.replace(generation,id)])) });
      return { key, size: 100, httpMetadata: { contentType: "image/png" } };
    });
    expect(await queuePreviewStoryMail("a", id)).toBe(false); expect(count()).toBe(0);
    metadata(story()); mocks.head.mockImplementation(async (key: string) => ({ key, size: 100, httpMetadata: { contentType: "image/png" } }));
    outbox.sqlite.exec("DROP TABLE auth_mail_outbox");
    await expect(queuePreviewStoryMail("a", id)).rejects.toThrow();
  });

});

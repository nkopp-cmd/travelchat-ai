// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn(), auth: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user, auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
import { GET, PATCH } from "@/app/api/itineraries/[id]/ai-backgrounds/route";
import { savePreviewItinerary } from "@/lib/app-data/preview-itinerary-save";
import { savePreviewBackground } from "@/lib/app-data/preview-story-background-cache";
import { previewFreshStoryBackgrounds, updatePreviewFreshStoryBackgrounds, readPreviewFreshBackgroundPatch } from "@/lib/app-data/preview-fresh-story-backgrounds";

const origin = "https://localley-next-preview.nkopp.workers.dev";
const symbol = Symbol.for("__cloudflare-context__");
const environment = process.env;
const oldContext = (globalThis as Record<symbol, unknown>)[symbol];
let db: D1Sqlite, id: string, cover: string, day: string;
let objects: Map<string, Uint8Array>;
let bucket: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
const user = (name = "a", verified = true, email = `${name}@preview.localley.test`) => {
  mocks.auth.mockResolvedValue({ userId: name });
  mocks.user.mockResolvedValue({ id: name, emailVerified: verified, primaryEmailAddress: { emailAddress: email } });
};
const request = (method: string, patch?: object, fresh = true, host = origin) => new NextRequest(
  `${host}/api/itineraries/${id}/ai-backgrounds?data_candidate=d1${fresh ? "&background_candidate=fresh" : ""}`,
  { method, ...(patch ? { body: JSON.stringify(patch) } : {}) });
const params = () => ({ params: Promise.resolve({ id }) });
const media = () => db.sqlite.prepare("SELECT * FROM legacy_itinerary_media WHERE itineraryId=?").get(id);

beforeEach(async () => {
  vi.clearAllMocks(); db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY REFERENCES owners(id),clerkUserId TEXT NOT NULL);
    CREATE TABLE itineraries(id TEXT PRIMARY KEY,ownerId TEXT REFERENCES owners(id),title TEXT,city TEXT,days INTEGER,
      activities TEXT,local_score INTEGER,created_at TEXT);
    CREATE TABLE legacy_itinerary_media(itineraryId TEXT PRIMARY KEY REFERENCES itineraries(id),
      aiBackgrounds TEXT CHECK(aiBackgrounds IS NULL OR json_valid(aiBackgrounds)),
      storySlides TEXT CHECK(storySlides IS NULL OR json_valid(storySlides)),isPublic INTEGER DEFAULT 0,
      likeCount INTEGER DEFAULT 0,viewCount INTEGER DEFAULT 0,sourceProfileId TEXT);
    INSERT INTO owners VALUES('auth:b','new');`);
  for (const file of ["0028_preview_story_backgrounds.sql", "0031_preview_story_background_capacity.sql"]) {
    db.sqlite.exec(readFileSync(`migrations/app-preview/${file}`, "utf8"));
  }
  mocks.reader.mockReturnValue(db); user();
  mocks.source.mockImplementation(() => { throw new Error("Source must not be called"); });
  objects = new Map(); bucket = {
    put: vi.fn(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes); return {}; }),
    delete: vi.fn(async (key: string) => { objects.delete(key); }),
    get: vi.fn(async (key: string) => objects.has(key) ? { arrayBuffer: async () => Buffer.from(objects.get(key)!) } : null),
  };
  process.env = { ...environment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
  (globalThis as Record<symbol, unknown>)[symbol] = { env: { STORY_PREVIEW_MEDIA: bucket } };
  id = (await savePreviewItinerary("a", { title: "Fresh trip", city: "Seoul", days: 2, activities: [] })).id as string;
  const bytes = Buffer.alloc(700); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  cover = await savePreviewBackground("auth:a", createHash("sha256").update("cover").digest("hex"), bytes);
  day = await savePreviewBackground("auth:a", createHash("sha256").update("day").digest("hex"), bytes);
  bucket.put.mockClear(); bucket.delete.mockClear();
});
afterEach(() => { db.sqlite.close(); process.env = environment; (globalThis as Record<symbol, unknown>)[symbol] = oldContext; });

describe("fresh background links before slide persistence", () => {
  it("reads an empty actual saved trip, creates media and merges only owned background fields", async () => {
    expect(media()).toBeUndefined();
    expect(await (await GET(request("GET"), params())).json()).toEqual({ success: true, backgrounds: {} });
    const response = await PATCH(request("PATCH", { cover }), params());
    expect(response.status).toBe(200); expect(response.headers.get("x-localley-data-source")).toBe("d1-preview");
    expect(await response.json()).toEqual({ success: true, itinerary: { id, ai_backgrounds: { cover } } });
    db.sqlite.prepare("UPDATE legacy_itinerary_media SET storySlides=?,isPublic=1,likeCount=7,viewCount=8,sourceProfileId='retained' WHERE itineraryId=?").run('{"keep":true}', id);
    expect(await updatePreviewFreshStoryBackgrounds(id, "a", { day2: day })).toEqual({ cover, day2: day });
    expect(media()).toMatchObject({ storySlides: '{"keep":true}', isPublic: 1, likeCount: 7, viewCount: 8, sourceProfileId: "retained" });
    expect(bucket.put).not.toHaveBeenCalled(); expect(bucket.delete).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled();
    expect(db.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("refuses foreign, unverified, real-domain and historical owners without cache reads or writes", async () => {
    for (const change of [() => user("b"), () => user("a", false), () => user("a", true, "a@example.com")]) {
      change(); expect((await GET(request("GET"), params())).status).toBe(404);
      expect((await PATCH(request("PATCH", { cover }), params())).status).toBe(404);
    }
    user(); db.sqlite.exec("INSERT INTO legacy_owners VALUES('auth:a','a')");
    expect((await PATCH(request("PATCH", { cover }), params())).status).toBe(404);
    expect(media()).toBeUndefined(); expect(bucket.get).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled();
  });

  it("keeps concurrent disjoint patches and reads repeated cache bytes only once per patch", async () => {
    expect(await updatePreviewFreshStoryBackgrounds(id, "a", { cover, day1: cover, day2: cover })).toEqual({ cover, day1: cover, day2: cover });
    expect(bucket.get).toHaveBeenCalledTimes(1);
    db.sqlite.prepare("UPDATE itineraries SET days=14 WHERE id=?").run(id);
    const patches = Array.from({ length: 12 }, (_, i) => ({ [`day${i + 1}`]: day }));
    expect((await Promise.all(patches.map(p => updatePreviewFreshStoryBackgrounds(id, "a", p)))).every(Boolean)).toBe(true);
    expect(await previewFreshStoryBackgrounds(id, "a")).toEqual(Object.assign({ cover }, ...patches));
  });

  it("rejects source URLs, foreign cache references and days beyond the owned trip", async () => {
    const foreign = await savePreviewBackground("auth:b", "f".repeat(64), objects.values().next().value!);
    for (const patch of [{ cover: "/images/source.png" }, { cover: "https://fal.media/source.png" }, { cover: foreign }, { day3: day }]) {
      expect((await PATCH(request("PATCH", patch), params())).status).toBe(400);
    }
    expect(media()).toBeUndefined(); expect(mocks.source).not.toHaveBeenCalled();
  });

  it("preserves the existing missing-row refusal without the fresh opt-in", async () => {
    expect((await PATCH(request("PATCH", { cover }, false), params())).status).toBe(404);
    expect(media()).toBeUndefined(); expect(mocks.source).not.toHaveBeenCalled();
  });

  it("refuses absent safety flags and signed-out callers without source access", async () => {
    for (const settings of [{ AUTH_MAIL_MODE: undefined }, { AUTH_MAIL_MODE: "live" }, { SUPABASE_READ_ONLY: undefined }, { SUPABASE_READ_ONLY: "false" }]) {
      process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true", ...settings };
      expect((await GET(request("GET"), params())).status).toBe(500);
      expect((await PATCH(request("PATCH", { cover }), params())).status).toBe(500);
    }
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await PATCH(request("PATCH", { cover }), params())).status).toBe(401);
    expect((await GET(request("GET"), params())).status).toBe(401);
    expect(media()).toBeUndefined(); expect(mocks.source).not.toHaveBeenCalled();
  });

  it("bounds actual missing-length streams and rejects malformed UTF8 or JSON before writes", async () => {
    const cancel = vi.fn(); let parts = 0;
    const req = new Request(origin, { method: "POST", body: new ReadableStream({ pull(controller) {
      if (parts++ < 20) controller.enqueue(new Uint8Array(1024)); else controller.close();
    }, cancel }), duplex: "half" } as RequestInit);
    expect(await readPreviewFreshBackgroundPatch(req)).toBeNull(); expect(cancel).toHaveBeenCalledOnce();
    for (const body of ["{", new Uint8Array([0xff])]) {
      expect(await readPreviewFreshBackgroundPatch(new Request(origin, { method: "POST", body }))).toBeNull();
    }
    const oversized = new NextRequest(`${origin}/api/itineraries/${id}/ai-backgrounds?data_candidate=d1&background_candidate=fresh`,
      { method: "PATCH", body: JSON.stringify({ cover: "x".repeat(16385) }) });
    expect((await PATCH(oversized, params())).status).toBe(400);
    expect(media()).toBeUndefined(); expect(bucket.get).not.toHaveBeenCalled();
  });

  it.each(["trip", "cache", "days", "historical"])("rechecks %s state atomically before creating media", async kind => {
    bucket.get.mockImplementationOnce(async (key: string) => {
      if (kind === "trip") db.sqlite.prepare("UPDATE itineraries SET ownerId='auth:b' WHERE id=?").run(id);
      if (kind === "cache") db.sqlite.exec("UPDATE preview_story_backgrounds SET ownerId='auth:b'");
      if (kind === "days") db.sqlite.prepare("UPDATE itineraries SET days=1 WHERE id=?").run(id);
      if (kind === "historical") db.sqlite.exec("INSERT INTO legacy_owners VALUES('auth:a','a')");
      return { arrayBuffer: async () => Buffer.from(objects.get(key)!) };
    });
    expect(await updatePreviewFreshStoryBackgrounds(id, "a", { day2: day })).toBeNull();
    expect(media()).toBeUndefined(); expect(objects.size).toBe(2); expect(bucket.delete).not.toHaveBeenCalled();
  });

  it("refuses malformed retained source references before changing any field", async () => {
    db.sqlite.prepare("INSERT INTO legacy_itinerary_media(itineraryId,aiBackgrounds) VALUES(?,?)").run(id, '{"cover":"/images/source.png"}');
    const before = media();
    await expect(updatePreviewFreshStoryBackgrounds(id, "a", { day2: day })).rejects.toThrow("Owned preview background required");
    expect(media()).toEqual(before); expect(bucket.get).not.toHaveBeenCalled();
  });

  it("retains a committed background link after an ambiguous write reply without retry or R2 mutation", async () => {
    const prepare = db.prepare.bind(db); let writes = 0;
    mocks.reader.mockReturnValue({ prepare: (sql: string) => ({ bind: (...args: unknown[]) => {
      const statement = prepare(sql).bind(...args);
      return { first: statement.first.bind(statement), all: statement.all.bind(statement), run: async () => {
        const result = await statement.run();
        if (sql.startsWith("INSERT INTO legacy_itinerary_media")) { writes++; throw new Error("D1 reply lost"); }
        return result;
      } };
    } }) });
    await expect(updatePreviewFreshStoryBackgrounds(id, "a", { cover })).rejects.toThrow("D1 reply lost");
    expect(writes).toBe(1); expect(await previewFreshStoryBackgrounds(id, "a")).toEqual({ cover });
    expect(objects.size).toBe(2); expect(bucket.delete).not.toHaveBeenCalled();
  });

  it("refuses missing or byte-corrupt R2 content before linking it", async () => {
    bucket.get.mockResolvedValueOnce(null);
    await expect(updatePreviewFreshStoryBackgrounds(id, "a", { cover })).rejects.toThrow("Cache object missing");
    bucket.get.mockResolvedValueOnce({ arrayBuffer: async () => Buffer.alloc(700) });
    await expect(updatePreviewFreshStoryBackgrounds(id, "a", { cover })).rejects.toThrow("Cache object mismatch");
    expect(media()).toBeUndefined();
  });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), user: vi.fn(), auth: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.user, auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/app-data/preview-story-tier", () => ({ previewStoryTier: async () => "free" }));
import { POST } from "@/app/api/itineraries/[id]/story/persist/route";
import { savePreviewItinerary } from "@/lib/app-data/preview-itinerary-save";
import { savePreviewStoryMedia } from "@/lib/app-data/preview-story-media";
import { previewStoryGallery } from "@/lib/app-data/preview-story-gallery";
import { previewStoryReady } from "@/lib/app-data/preview-story-readiness";
import { readPreviewStoryForm, previewStorySlideBytes, previewStoryTotalBytes } from "@/lib/app-data/preview-story-upload";

const host = "https://localley-next-preview.nkopp.workers.dev";
const context = Symbol.for("__cloudflare-context__");
const environment = process.env;
const oldContext = (globalThis as Record<symbol, unknown>)[context];
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
let db: D1Sqlite;
let id: string;
let objects: Map<string, Uint8Array>;
let bucket: { put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; head: ReturnType<typeof vi.fn> };
const user = (name = "a", verified = true, email = `${name}@preview.localley.test`) => {
  mocks.auth.mockResolvedValue({ userId: name });
  mocks.user.mockResolvedValue({ id: name, emailVerified: verified, primaryEmailAddress: { emailAddress: email } });
};
const form = (bytes: Uint8Array, slides = ["cover", "day1", "summary"]) => {
  const f = new FormData();
  for (const slide of slides) f.append(slide, new Blob([Buffer.from(bytes)], { type: "image/png" }), `${slide}.png`);
  return f;
};
const post = (body: FormData, fresh = true) => POST(new NextRequest(
  `${host}/api/itineraries/${id}/story/persist?data_candidate=d1${fresh ? "&gallery_candidate=fresh" : ""}`,
  { method: "POST", body }), { params: Promise.resolve({ id }) });

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
  mocks.reader.mockReturnValue(db); user();
  mocks.source.mockImplementation(() => { throw new Error("Source must not be called"); });
  objects = new Map();
  bucket = {
    put: vi.fn(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes); return {}; }),
    delete: vi.fn(async (key: string) => { objects.delete(key); }),
    get: vi.fn(async (key: string) => objects.has(key) ? { arrayBuffer: async () => Buffer.from(objects.get(key)!) } : null),
    head: vi.fn(async (key: string) => objects.has(key) ? { key, size: objects.get(key)!.length, httpMetadata: { contentType: "image/png" } } : null),
  };
  process.env = { ...environment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
  (globalThis as Record<symbol, unknown>)[context] = { env: { STORY_PREVIEW_MEDIA: bucket } };
  const saved = await savePreviewItinerary("a", { title: "Owned trip", city: "Seoul", days: 1, activities: [] });
  id = saved.id as string;
});
afterEach(() => { db.sqlite.close(); process.env = environment; (globalThis as Record<symbol, unknown>)[context] = oldContext; });

let rendered: Buffer | undefined;
async function largeRenderedPng() {
  if (rendered) return rendered;
  const crc = (data: Buffer) => { let v = 0xffffffff; for (const b of data) { v ^= b; for (let i = 0; i < 8; i++) v = (v >>> 1) ^ ((v & 1) ? 0xedb88320 : 0); } return (v ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const name = Buffer.from(type), len = Buffer.alloc(4), sum = Buffer.alloc(4); len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([len, name, data, sum]); };
  const width = 1080, height = 1920, scan = Buffer.alloc((width * 3 + 1) * height); let seed = 123456789;
  for (let y = 0; y < height; y++) for (let x = 1; x <= width * 3; x++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; scan[y * (width * 3 + 1) + x] = seed & 255; }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scan, { level: 0 })), chunk("IEND", Buffer.alloc(0))]);
  rendered = Buffer.from(await new ImageResponse(createElement("div", { style: { display: "flex", width: "100%", height: "100%" } }, createElement("img", { src: `data:image/png;base64,${png.toString("base64")}`, width, height })), { width, height }).arrayBuffer());
  expect(rendered.length).toBeGreaterThan(2 * 1024 * 1024); expect(rendered.length).toBeLessThan(previewStorySlideBytes);
  expect(rendered.readUInt32BE(16)).toBe(width); expect(rendered.readUInt32BE(20)).toBe(height);
  return rendered;
}

describe("fresh candidate story persistence and observed readiness", () => {
  it("saves real rendered large PNGs for an actual new trip, reads its gallery and replaces only owned media", async () => {
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM legacy_itinerary_media").get()).toEqual({ n: 0 });
    const png = await largeRenderedPng(); const response = await post(form(png));
    expect(response.status).toBe(200); expect(response.headers.get("x-localley-data-source")).toBe("d1-preview");
    const saved = await response.json(); expect(saved.slides.cover).toContain("&gallery_candidate=fresh");
    expect(objects.size).toBe(3); for (const bytes of objects.values()) expect(sha(bytes)).toBe(sha(png));
    expect((await previewStoryGallery(id, "a"))?.story_slides?.slides).toEqual(saved.slides);
    expect(await previewStoryReady(id, "a")).toBe(true);
    db.sqlite.prepare("UPDATE legacy_itinerary_media SET aiBackgrounds=?,isPublic=1,likeCount=7,viewCount=8,sourceProfileId='retained' WHERE itineraryId=?").run('{"cover":"/images/existing.png"}', id);
    expect((await post(form(png))).status).toBe(200); expect(objects.size).toBe(3); expect(bucket.delete).toHaveBeenCalledTimes(3);
    expect(db.sqlite.prepare("SELECT aiBackgrounds,isPublic,likeCount,viewCount,sourceProfileId FROM legacy_itinerary_media").get()).toEqual({ aiBackgrounds: '{"cover":"/images/existing.png"}', isPublic: 1, likeCount: 7, viewCount: 8, sourceProfileId: "retained" });
    user("b"); expect(await previewStoryGallery(id, "b")).toBeNull(); expect(await previewStoryReady(id, "b")).toBe(false);
    expect(mocks.source).not.toHaveBeenCalled();
  }, 20000);

  it("refuses foreign, unverified, real-domain, conflicting historical and lost fresh opt-in writes", async () => {
    const small = new Uint8Array([137,80,78,71,13,10,26,10,1]);
    for (const who of [() => user("b"), () => user("a", false), () => user("a", true, "real@example.com")]) {
      who(); expect((await post(form(small))).status).toBe(404);
    }
    user(); expect((await post(form(small), false)).status).toBe(404);
    db.sqlite.exec("INSERT INTO owners VALUES('legacy-a','legacy-fixture'); INSERT INTO legacy_owners VALUES('legacy-a','a')");
    expect((await post(form(small))).status).toBe(404);
    expect(bucket.put).not.toHaveBeenCalled(); expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM legacy_itinerary_media").get()).toEqual({ n: 0 });
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("rejects oversized slides, WebP and an excessive aggregate before any R2 or metadata write", async () => {
    const tooBig = Buffer.alloc(previewStorySlideBytes + 1); Buffer.from([137,80,78,71,13,10,26,10]).copy(tooBig);
    expect((await post(form(tooBig, ["cover"]))).status).toBe(400);
    expect((await post(form(Buffer.from("RIFFxxxxWEBP"), ["cover"]))).status).toBe(400);
    db.sqlite.prepare("UPDATE itineraries SET days=10 WHERE id=?").run(id);
    const f = new FormData(); const bytes = tooBig.subarray(0, previewStorySlideBytes);
    for (const slide of ["cover", ...Array.from({ length: 8 }, (_, i) => `day${i + 1}`)]) f.append(slide, new Blob([bytes]));
    await expect(savePreviewStoryMedia(id, "a", f, "free", 7, true)).rejects.toThrow("too large");
    expect(bucket.put).not.toHaveBeenCalled(); expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM legacy_itinerary_media").get()).toEqual({ n: 0 });
  });

  it("refuses oversize object metadata and a changed generation during readiness", async () => {
    const png = await largeRenderedPng(); expect((await post(form(png))).status).toBe(200);
    bucket.head.mockImplementationOnce(async (key: string) => ({ key, size: previewStorySlideBytes + 1, httpMetadata: { contentType: "image/png" } }));
    expect(await previewStoryReady(id, "a")).toBe(false);
    bucket.head.mockImplementationOnce(async (key: string) => { db.sqlite.prepare("UPDATE legacy_itinerary_media SET storySlides=NULL WHERE itineraryId=?").run(id); return { key, size: png.length, httpMetadata: { contentType: "image/png" } }; });
    expect(await previewStoryReady(id, "a")).toBe(false);
  }, 15000);

  it("retains new objects if the fresh metadata insert commits before losing its reply", async () => {
    const prepare = db.prepare.bind(db);
    mocks.reader.mockReturnValue({ prepare: (sql: string) => ({ bind: (...args: (string | number | null)[]) => {
      const statement = prepare(sql).bind(...args);
      return { first: statement.first.bind(statement), all: statement.all.bind(statement), run: async () => {
        const result = await statement.run();
        if (sql.startsWith("INSERT INTO legacy_itinerary_media")) throw new Error("D1 reply lost");
        return result;
      } };
    } }) });
    const small = new Uint8Array([137,80,78,71,13,10,26,10,1]);
    await expect(savePreviewStoryMedia(id, "a", form(small), "free", 7, true)).rejects.toThrow("D1 reply lost");
    expect(objects.size).toBe(3); expect(bucket.delete).not.toHaveBeenCalled();
    expect(await previewStoryReady(id, "a")).toBe(true);
  });

  it("rechecks ownership at the metadata insert and removes only its new generation on refusal", async () => {
    bucket.put.mockImplementationOnce(async (key: string, bytes: Uint8Array) => {
      objects.set(key, bytes); db.sqlite.prepare("UPDATE itineraries SET ownerId='auth:b' WHERE id=?").run(id); return {};
    });
    const small = new Uint8Array([137,80,78,71,13,10,26,10,1]);
    await expect(savePreviewStoryMedia(id, "a", form(small), "free", 7, true)).rejects.toThrow("did not match owner");
    expect(objects.size).toBe(0); expect(bucket.delete).toHaveBeenCalledTimes(3);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM legacy_itinerary_media").get()).toEqual({ n: 0 });
  });

  it("refuses a complete gallery whose individually allowed object heads exceed the aggregate bound", async () => {
    const generation = "22222222-2222-4222-8222-222222222222";
    db.sqlite.prepare("UPDATE itineraries SET days=10 WHERE id=?").run(id);
    const slides = Object.fromEntries(["cover", ...Array.from({ length: 10 }, (_, i) => `day${i + 1}`), "summary"].map(slide =>
      [slide, `r2://story-slides/${id}/${generation}/${slide}.png`]));
    db.sqlite.prepare("INSERT INTO legacy_itinerary_media(itineraryId,storySlides) VALUES(?,?)").run(id, JSON.stringify({ generated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), tier: "free", slides }));
    bucket.head.mockImplementation(async (key: string) => ({ key, size: previewStorySlideBytes, httpMetadata: { contentType: "image/png" } }));
    expect(await previewStoryReady(id, "a")).toBe(false);
  });
});

describe("bounded multipart reader", () => {
  it("cancels oversized actual streams with missing or false Content-Length", async () => {
    for (const headers of [{ "Content-Type": "multipart/form-data; boundary=x" }, { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": "1" }]) {
      const cancel = vi.fn(); const bytes = new Uint8Array(1024 * 1024); let count = 0;
      const req = new Request(host, { method: "POST", headers,
        body: new ReadableStream({ pull(controller) { if (count++ < 66) controller.enqueue(bytes); else controller.close(); }, cancel }), duplex: "half" } as RequestInit);
      await expect(readPreviewStoryForm(req)).rejects.toThrow("too large"); expect(cancel).toHaveBeenCalledOnce();
    }
  });
  it("refuses malformed multipart and an oversized declared body without reading it", async () => {
    const req = new Request(host, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x", "Content-Length": String(previewStoryTotalBytes + 128 * 1024 + 1) }, body: "not multipart" });
    await expect(readPreviewStoryForm(req)).rejects.toThrow("too large"); expect(req.bodyUsed).toBe(false);
    await expect(readPreviewStoryForm(new Request(host, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=x" }, body: "not multipart" }))).rejects.toThrow("Invalid story upload");
  });
});

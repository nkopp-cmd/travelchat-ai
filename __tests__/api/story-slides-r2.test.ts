// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), server: vi.fn(), tier: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.server }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier }));
vi.mock("@/lib/subscription", () => ({ hasFeature: () => 7 }));
import { POST as persist } from "@/app/api/itineraries/[id]/story/persist/route";
import { GET as media } from "@/app/api/itineraries/[id]/story/media/[generation]/[slide]/route";
import { GET as cleanup } from "@/app/api/cron/cleanup-stories/route";
import { DELETE as deleteItinerary } from "@/app/api/itineraries/[id]/route";
import { storySlideKeyFromUrl, storySlideKeys } from "@/lib/story-slides-r2";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GEN = "33333333-3333-4333-8333-333333333333";
const context = Symbol.for("__cloudflare-context__");
const png = () => { const bytes = new Uint8Array(32); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); return bytes; };
const slideUrl = (id = ID, gen = GEN, slide = "cover") => `https://www.localley.io/api/itineraries/${id}/story/media/${gen}/${slide}`;
const future = () => new Date(Date.now() + 86_400_000).toISOString();
let objects: Map<string, Uint8Array>;
let bucket: { put: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
let row: Record<string, unknown> | null;
let update: ReturnType<typeof vi.fn>, upload: ReturnType<typeof vi.fn>, remove: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  objects = new Map();
  bucket = {
    put: vi.fn(async (key: string, body: Uint8Array) => { objects.set(key, body); return {}; }),
    get: vi.fn(async (key: string) => objects.has(key) ? { arrayBuffer: async () => objects.get(key)!.slice().buffer } : null),
    delete: vi.fn(async (key: string) => { objects.delete(key); }),
  };
  (globalThis as Record<symbol, unknown>)[context] = { env: { STORY_MEDIA_R2: bucket } };
  mocks.auth.mockResolvedValue({ userId: "owner" });
  mocks.tier.mockResolvedValue("pro");
  row = { id: ID, clerk_user_id: "owner", shared: false, story_slides: null };
  update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  upload = vi.fn().mockResolvedValue({ error: null });
  remove = vi.fn().mockResolvedValue({ error: null });
  const query: Record<string, unknown> = {};
  Object.assign(query, {
    select: vi.fn(() => query), eq: vi.fn(() => query), not: vi.fn(() => query),
    lt: vi.fn(async () => ({ data: row ? [row] : [], error: null })),
    single: vi.fn(async () => ({ data: row, error: row ? null : { code: "PGRST116" } })),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    update, delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
  });
  const client = { from: vi.fn(() => query), storage: { from: vi.fn(() => ({ upload, remove,
    createSignedUrl: async () => ({ data: { signedUrl: "https://x.supabase.co/signed/cover.png" }, error: null }) })) } };
  mocks.source.mockReturnValue(client);
  mocks.server.mockResolvedValue(client);
});
afterEach(() => { delete (globalThis as Record<symbol, unknown>)[context]; vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const persistRequest = () => {
  const body = new FormData();
  body.append("cover", new Blob([Buffer.from(png())], { type: "image/png" }), "cover.png");
  return persist(new NextRequest(`https://www.localley.io/api/itineraries/${ID}/story/persist`, { method: "POST", body }), { params: Promise.resolve({ id: ID }) });
};
const getSlide = (gen = GEN, slide = "cover", id = ID) =>
  media(new NextRequest(slideUrl(id, gen, slide)), { params: Promise.resolve({ id, generation: gen, slide }) });

describe("story slide URLs", () => {
  it("map back to their own itinerary's R2 key only", () => {
    expect(storySlideKeyFromUrl(ID, slideUrl())).toBe(`story-slides/${ID}/${GEN}/cover.png`);
    expect(storySlideKeyFromUrl(OTHER, slideUrl())).toBeNull();
    expect(storySlideKeyFromUrl(ID, "https://x.supabase.co/storage/v1/object/sign/generated-images/story-slides/x/cover.png")).toBeNull();
    expect(storySlideKeys(ID, { slides: { cover: slideUrl(), day1: "https://x.supabase.co/a.png", bad: 3 } })).toEqual([`story-slides/${ID}/${GEN}/cover.png`]);
  });
});

describe("persist writes R2 (Supabase dual write)", () => {
  it("stores the slide under a fresh generation, links the access-checked route and deletes the previous story", async () => {
    const oldKey = `story-slides/${ID}/${GEN}/cover.png`;
    objects.set(oldKey, png());
    row!.story_slides = { slides: { cover: slideUrl() }, expires_at: future() };
    const body = await (await persistRequest()).json();
    const url: string = body.slides.cover;
    const key = storySlideKeyFromUrl(ID, url);
    expect(url.startsWith(`https://www.localley.io/api/itineraries/${ID}/story/media/`)).toBe(true);
    expect(key).not.toBe(oldKey);
    expect(objects.has(key!)).toBe(true);
    expect(objects.has(oldKey)).toBe(false);
    expect(upload).toHaveBeenCalledWith(`story-slides/${ID}/cover.png`, expect.anything(), { contentType: "image/png", upsert: true });
    expect(update).toHaveBeenCalledWith({ story_slides: expect.objectContaining({ slides: { cover: url } }) });
  });

  it("falls back to the Supabase signed URL when R2 fails, and keeps R2 when only the Supabase dual write fails", async () => {
    bucket.put.mockRejectedValueOnce(new Error("r2 down"));
    expect((await (await persistRequest()).json()).slides.cover).toBe("https://x.supabase.co/signed/cover.png");
    upload.mockResolvedValueOnce({ error: { message: "storage down" } });
    expect((await (await persistRequest()).json()).slides.cover).toContain("/story/media/");
  });
});

describe("media route serves production slides by the itinerary policy", () => {
  beforeEach(() => {
    objects.set(`story-slides/${ID}/${GEN}/cover.png`, png());
    row!.story_slides = { slides: { cover: slideUrl() }, expires_at: future() };
  });

  it("owner gets the private bytes; a stranger gets 404 unless the itinerary is shared", async () => {
    const owner = await getSlide();
    expect(owner.status).toBe(200);
    expect(owner.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await owner.arrayBuffer())).toEqual(png());
    mocks.auth.mockResolvedValue({ userId: "stranger" });
    expect((await getSlide()).status).toBe(404);
    row!.shared = true;
    const shared = await getSlide();
    expect(shared.status).toBe(200);
    expect(shared.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(shared.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("refuses expired stories, other generations, bad slide names and missing objects", async () => {
    expect((await getSlide("44444444-4444-4444-8444-444444444444")).status).toBe(404);
    expect((await getSlide(GEN, "day99")).status).toBe(404);
    objects.clear();
    expect((await getSlide()).status).toBe(404);
    objects.set(`story-slides/${ID}/${GEN}/cover.png`, png());
    row!.story_slides = { slides: { cover: slideUrl() }, expires_at: new Date(Date.now() - 1000).toISOString() };
    const expired = await getSlide();
    expect(expired.status).toBe(404);
    expect(expired.headers.get("cache-control")).toBe("no-store");
  });
});

describe("deleting stories deletes their R2 slides", () => {
  beforeEach(() => {
    objects.set(`story-slides/${ID}/${GEN}/cover.png`, png());
    row!.story_slides = { slides: { cover: slideUrl() }, expires_at: new Date(Date.now() - 1000).toISOString() };
    vi.stubEnv("CRON_SECRET", "s");
  });
  const cron = () => cleanup(new NextRequest("https://www.localley.io/api/cron/cleanup-stories", { headers: { authorization: "Bearer s" } }));

  it("the expiry cron deletes R2 objects before clearing the record", async () => {
    expect((await cron()).status).toBe(200);
    expect(objects.size).toBe(0);
    expect(update).toHaveBeenCalledWith({ story_slides: null });
  });

  it("the expiry cron keeps the record when R2 cannot delete, so the next run retries", async () => {
    bucket.delete.mockRejectedValueOnce(new Error("r2 down"));
    await cron();
    expect(update).not.toHaveBeenCalled();
  });

  it("deleting the itinerary deletes its slides", async () => {
    const response = await deleteItinerary(new NextRequest(`https://www.localley.io/api/itineraries/${ID}`, { method: "DELETE" }), { params: Promise.resolve({ id: ID }) });
    expect(response.status).toBe(200);
    expect(objects.size).toBe(0);
  });
});

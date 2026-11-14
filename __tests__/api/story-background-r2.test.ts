// @vitest-environment node
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), tier: vi.fn(), weighted: vi.fn(), generate: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier, checkAndIncrementUsageWeighted: mocks.weighted }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => async () => null }));
vi.mock("@/lib/imagen", () => ({ isImagenAvailable: () => true }));
vi.mock("@/lib/image-provider", () => ({ getImageProvider: () => "gemini", isAnyProviderAvailable: () => true, generateStoryBackground: mocks.generate, generateDayBackground: mocks.generate }));
import { POST } from "@/app/api/images/story-background/route";
import { PATCH } from "@/app/api/itineraries/[id]/ai-backgrounds/route";

const context = Symbol.for("__cloudflare-context__");
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(600, 7)]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 9)]);
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
let put: ReturnType<typeof vi.fn>;
let objects: Map<string, unknown>;

const post = (extra: Record<string, unknown> = {}) => POST(new NextRequest("https://www.localley.io/api/images/story-background", {
  method: "POST", body: JSON.stringify({ type: "cover", city: "Osaka", ...extra }),
}));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ userId: "u1" });
  mocks.tier.mockResolvedValue("premium");
  mocks.weighted.mockResolvedValue({ allowed: true, usage: {} });
  mocks.generate.mockResolvedValue(`data:image/png;base64,${png.toString("base64")}`);
  objects = new Map();
  put = vi.fn(async (key: string, body: unknown) => { objects.set(key, body); return {}; });
  const get = vi.fn(async (key: string) => objects.has(key) ? { text: async () => String(objects.get(key)) } : null);
  (globalThis as Record<symbol, unknown>)[context] = { env: { STORY_MEDIA_R2: { put, get } } };
});
afterEach(() => { delete (globalThis as Record<symbol, unknown>)[context]; vi.restoreAllMocks(); });

describe("story backgrounds write to R2 (story media step 2)", () => {
  it("stores the bytes content-addressed in R2 only (exit 8b) and returns the /media/story path", async () => {
    const body = await (await post()).json();
    expect(body).toMatchObject({ success: true, image: `/media/story/${sha(png)}.png` });
    expect(put).toHaveBeenCalledWith(`legacy/${sha(png)}.png`, expect.anything(), { httpMetadata: { contentType: "image/png" } });
    expect(Buffer.from(put.mock.calls[0][1] as Uint8Array).equals(png)).toBe(true);
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("keeps the detected format: a JPEG gets a .jpg key", async () => {
    mocks.generate.mockResolvedValue(`data:image/png;base64,${jpg.toString("base64")}`);
    expect((await (await post()).json()).image).toBe(`/media/story/${sha(jpg)}.jpg`);
    expect(put.mock.calls[0][2]).toEqual({ httpMetadata: { contentType: "image/jpeg" } });
  });

  it("never returns a Supabase URL when the R2 write fails or the binding is missing", async () => {
    put.mockRejectedValueOnce(new Error("r2 down"));
    const failed = await (await post()).json();
    expect(JSON.stringify(failed)).not.toContain("supabase");
    expect(failed.image ?? "").not.toMatch(/^\/media\/story\//);
    delete (globalThis as Record<symbol, unknown>)[context];
    expect(JSON.stringify(await (await post()).json())).not.toContain("supabase");
    expect(mocks.source).not.toHaveBeenCalled();
  });

  it("caches the R2 path per user and cache key, and serves the cache without generating again", async () => {
    const first = (await (await post({ cacheKey: "i1-cover" })).json()).image;
    expect(objects.get("cache/u1/i1-cover")).toBe(first);
    mocks.generate.mockClear();
    expect(await (await post({ cacheKey: "i1-cover" })).json()).toMatchObject({ image: first, source: "cache", cached: true });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

describe("ai-backgrounds PATCH accepts R2 story media paths", () => {
  const patch = (cover: string) => PATCH(new NextRequest("https://www.localley.io/api/itineraries/i1/ai-backgrounds", {
    method: "PATCH", body: JSON.stringify({ cover }),
  }), { params: Promise.resolve({ id: "i1" }) });

  beforeEach(() => {
    const chain = {
      select: () => chain, eq: () => chain,
      single: async () => ({ data: { clerk_user_id: "u1", ai_backgrounds: {} }, error: null }),
      update: (value: unknown) => { mocks.update(value); return chain; },
    };
    mocks.source.mockReturnValue({ from: () => chain });
  });

  it("stores a content-addressed path and rejects look-alikes", async () => {
    const path = `/media/story/${"a".repeat(64)}.jpg`;
    expect((await patch(path)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ ai_backgrounds: { cover: path } });
    for (const bad of ["/media/story/../secret.png", `/media/story/${"a".repeat(64)}.webp`, "/media/other/x.png"]) {
      expect((await patch(bad)).status).toBe(400);
    }
  });
});

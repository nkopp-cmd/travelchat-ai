// @vitest-environment node
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), tier: vi.fn(), weighted: vi.fn(), generate: vi.fn(), upload: vi.fn(), update: vi.fn() }));
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
const SUPABASE_URL = "https://x.supabase.co/storage/v1/object/public/generated-images/story-backgrounds/u1/cover.png";
let put: ReturnType<typeof vi.fn>;

const post = () => POST(new NextRequest("https://www.localley.io/api/images/story-background", {
  method: "POST", body: JSON.stringify({ type: "cover", city: "Seoul" }),
}));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ userId: "u1" });
  mocks.tier.mockResolvedValue("premium");
  mocks.weighted.mockResolvedValue({ allowed: true, usage: {} });
  mocks.generate.mockResolvedValue(`data:image/png;base64,${png.toString("base64")}`);
  mocks.upload.mockResolvedValue({ error: null });
  const storage = { from: () => ({ upload: mocks.upload, getPublicUrl: () => ({ data: { publicUrl: SUPABASE_URL } }), list: async () => ({ data: [] }) }) };
  mocks.source.mockReturnValue({ storage });
  put = vi.fn(async () => ({}));
  (globalThis as Record<symbol, unknown>)[context] = { env: { STORY_MEDIA_R2: { put } } };
});
afterEach(() => { delete (globalThis as Record<symbol, unknown>)[context]; vi.restoreAllMocks(); });

describe("story backgrounds write to R2 (story media step 2)", () => {
  it("stores the bytes content-addressed in R2, returns the /media/story path and still dual-writes Supabase", async () => {
    const body = await (await post()).json();
    expect(body).toMatchObject({ success: true, image: `/media/story/${sha(png)}.png` });
    expect(put).toHaveBeenCalledWith(`legacy/${sha(png)}.png`, expect.anything(), { httpMetadata: { contentType: "image/png" } });
    expect(Buffer.from(put.mock.calls[0][1] as Uint8Array).equals(png)).toBe(true);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("keeps the detected format: a JPEG gets a .jpg key", async () => {
    mocks.generate.mockResolvedValue(`data:image/png;base64,${jpg.toString("base64")}`);
    expect((await (await post()).json()).image).toBe(`/media/story/${sha(jpg)}.jpg`);
    expect(put.mock.calls[0][2]).toEqual({ httpMetadata: { contentType: "image/jpeg" } });
  });

  it("falls back to the Supabase URL when the R2 write fails or the binding is missing", async () => {
    put.mockRejectedValueOnce(new Error("r2 down"));
    expect((await (await post()).json()).image).toBe(SUPABASE_URL);
    delete (globalThis as Record<symbol, unknown>)[context];
    expect((await (await post()).json()).image).toBe(SUPABASE_URL);
  });

  it("a failed Supabase dual write does not fail the background when R2 has it", async () => {
    mocks.upload.mockResolvedValue({ error: { message: "storage down", name: "StorageError" } });
    const body = await (await post()).json();
    expect(body).toMatchObject({ success: true, image: `/media/story/${sha(png)}.png` });
    expect(body.failedProviders).toBeUndefined();
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

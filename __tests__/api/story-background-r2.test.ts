// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), tier: vi.fn(), weighted: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
// Library behaviour with a live theme x light set (independent of the shipped manifest state).
vi.mock("@/lib/image-library.json", async (orig) => (await import("../fixtures/live-image-library")).liveImageLibrary(orig));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier, checkAndIncrementUsageWeighted: mocks.weighted }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => async () => null }));
import { POST } from "@/app/api/images/story-background/route";
import { PATCH } from "@/app/api/itineraries/[id]/ai-backgrounds/route";

const context = Symbol.for("__cloudflare-context__");
let put: ReturnType<typeof vi.fn>;
let objects: Map<string, unknown>;

// A city outside lib/image-library.json: it still gets the nearest library image.
const post = (extra: Record<string, unknown> = {}) => POST(new NextRequest("https://www.localley.io/api/images/story-background", {
  method: "POST", body: JSON.stringify({ type: "cover", city: "Lisbon", ...extra }),
}));

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ userId: "u1" });
  mocks.tier.mockResolvedValue("premium");
  mocks.weighted.mockResolvedValue({ allowed: true, usage: {} });
  objects = new Map();
  put = vi.fn(async (key: string, body: unknown) => { objects.set(key, body); return {}; });
  const get = vi.fn(async (key: string) => objects.has(key) ? { text: async () => String(objects.get(key)) } : null);
  (globalThis as Record<symbol, unknown>)[context] = { env: { STORY_MEDIA_R2: { put, get } } };
});
afterEach(() => { delete (globalThis as Record<symbol, unknown>)[context]; vi.restoreAllMocks(); });

describe("story backgrounds: no R2 writes, no generation (library only)", () => {
  it("serves a library path for a city outside the library and writes nothing to R2", async () => {
    const body = await (await post()).json();
    expect(body).toMatchObject({ success: true, source: "library" });
    expect(body.image).toMatch(/^\/media\/story\/[0-9a-f]{64}\.jpg$/);
    expect(put).not.toHaveBeenCalled();
    expect(mocks.weighted).not.toHaveBeenCalled();
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

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/imagen", () => ({ isImagenAvailable: () => true, generateActivityThumbnail: mocks.generate }));
vi.mock("@/lib/supabase", () => { throw new Error("activity thumbnails must not touch Supabase (exit 8b)"); });
import { getAIActivityThumbnail } from "@/lib/activity-images";
import { GET } from "@/app/media/activity/[file]/route";

const context = Symbol.for("__cloudflare-context__");
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(64, 1)]);
let objects: Map<string, Uint8Array>;
let bucket: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  objects = new Map();
  bucket = {
    put: vi.fn(async (key: string, body: Uint8Array) => { objects.set(key, body); return {}; }),
    head: vi.fn(async (key: string) => (objects.has(key) ? {} : null)),
    get: vi.fn(async (key: string) => (objects.has(key) ? { arrayBuffer: async () => objects.get(key)!.slice().buffer } : null)),
  };
  (globalThis as Record<symbol, unknown>)[context] = { env: { STORY_MEDIA_R2: bucket } };
  mocks.generate.mockResolvedValue(png.toString("base64"));
});
afterEach(() => { delete (globalThis as Record<symbol, unknown>)[context]; vi.restoreAllMocks(); });

const file = (url: string) => url.split("/").pop()!;
const serve = (name: string) => GET(new NextRequest(`https://www.localley.io/media/activity/${name}`), { params: Promise.resolve({ file: name }) });

describe("AI activity thumbnails in R2 (Supabase exit 8a)", () => {
  it("stores a new thumbnail in R2 only (exit 8b) and links the public /media/activity path", async () => {
    const url = await getAIActivityThumbnail("Tea House", "cafe", "Seoul");
    expect(url).toMatch(/^\/media\/activity\/[0-9a-f]{1,8}\.png$/);
    expect(objects.has(`activity-thumbnails/${file(url!)}`)).toBe(true);
    const served = await serve(file(url!));
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(Buffer.from(await served.arrayBuffer()).equals(png)).toBe(true);
  });

  it("reuses an R2 thumbnail without generating again", async () => {
    const first = await getAIActivityThumbnail("Tea House", "cafe", "Seoul");
    mocks.generate.mockClear();
    expect(await getAIActivityThumbnail("Tea House", "cafe", "Seoul")).toBe(first);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("returns no thumbnail when R2 is unavailable (no Supabase fallback)", async () => {
    bucket.put.mockRejectedValueOnce(new Error("r2 down"));
    expect(await getAIActivityThumbnail("Night Market", "food", "Taipei")).toBeNull();
  });

  it("serves only hash-named thumbnails that exist", async () => {
    for (const name of ["..%2Fsecret.png", "abc.jpg", "123456789.png", "deadbeef.png"]) {
      const response = await serve(name);
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
});

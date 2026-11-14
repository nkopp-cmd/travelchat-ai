// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/imagen", () => ({ isImagenAvailable: () => true, generateActivityThumbnail: mocks.generate }));
vi.mock("@/lib/image-library", () => ({ libraryActivityThumbnail: (category?: string) => category === "cafe" ? "/media/activity/0000caf0.webp" : null }));
vi.mock("@/lib/supabase", () => { throw new Error("activity thumbnails must not touch Supabase (exit 8b)"); });
import { addAIThumbnailsToItinerary, getAIActivityThumbnail } from "@/lib/activity-images";
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
  mocks.generate.mockClear();
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
  it("serves library thumbnails as immutable WebP", async () => {
    const webp = Buffer.from("RIFF0000WEBPVP8 ");
    objects.set("activity-thumbnails/0000caf0.webp", webp);
    const response = await serve("0000caf0.webp");
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  it("fills library category images first and generates only the misses (reach-engine R8)", async () => {
    const plans = [{ day: 1, theme: "t", activities: [{ name: "Cafe Onion", category: "cafe" }, { name: "Gyeongbokgung", category: "temple" }] }];
    const [day] = await addAIThumbnailsToItinerary(plans, "Seoul");
    expect(day.activities[0]).toMatchObject({ image: "/media/activity/0000caf0.webp", aiGenerated: true });
    expect(day.activities[1].image).toMatch(/^\/media\/activity\/[0-9a-f]{1,8}\.png$/);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith("Gyeongbokgung", "temple", "Seoul");
    expect(plans[0].activities[0]).not.toHaveProperty("image");
  });
});


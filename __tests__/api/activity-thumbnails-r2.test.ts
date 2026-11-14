// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const retired = vi.hoisted(() => ({ paths: new Set<string>() }));
vi.mock("@/lib/image-library", () => ({ isRetiredLibraryPath: (p: string) => retired.paths.has(p), libraryActivityThumbnail: (category?: string) => category === "cafe" ? "/media/activity/0000caf0.webp" : null }));
vi.mock("@/lib/supabase", () => { throw new Error("activity thumbnails must not touch Supabase (exit 8b)"); });
import { addAIThumbnailsToItinerary } from "@/lib/activity-images";
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
});
afterEach(() => { delete (globalThis as Record<symbol, unknown>)[context]; vi.restoreAllMocks(); });

const serve = (name: string) => GET(new NextRequest(`https://www.localley.io/media/activity/${name}`), { params: Promise.resolve({ file: name }) });

describe("activity thumbnails: R2 media + painted library (Supabase exit 8a)", () => {
  it("serves an existing hash-named PNG thumbnail from R2", async () => {
    objects.set("activity-thumbnails/abc123.png", new Uint8Array(png));
    const served = await serve("abc123.png");
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(Buffer.from(await served.arrayBuffer()).equals(png)).toBe(true);
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

  it("refuses library thumbnails while the library is off live", async () => {
    objects.set("activity-thumbnails/0000caf0.webp", Buffer.from("RIFF0000WEBPVP8 "));
    retired.paths.add("/media/activity/0000caf0.webp");
    try {
      expect((await serve("0000caf0.webp")).status).toBe(404);
    } finally {
      retired.paths.clear();
    }
  });

  it("fills activities from the library only and never writes or generates (no paid image API)", async () => {
    const plans = [{ day: 1, theme: "t", activities: [{ name: "Cafe Onion", category: "cafe" }, { name: "Gyeongbokgung", category: "temple" }] }];
    const [day] = await addAIThumbnailsToItinerary(plans, "Seoul");
    expect(day.activities[0]).toMatchObject({ image: "/media/activity/0000caf0.webp", aiGenerated: true });
    expect(day.activities[1].image).toBeUndefined();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(plans[0].activities[0]).not.toHaveProperty("image");
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));

import { previewStoryOwner, savePreviewStoryMedia, previewStoryMediaUrl } from "@/lib/app-data/preview-story-media";

const id = "11111111-1111-4111-8111-111111111111";
const contextSymbol = Symbol.for("__cloudflare-context__");
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);
const form = () => { const data = new FormData(); data.append("cover", new Blob([png], { type: "image/png" })); return data; };
const originalEnvironment = process.env;
const originalContext = (globalThis as Record<symbol, unknown>)[contextSymbol];

afterEach(() => {
  process.env = originalEnvironment;
  (globalThis as Record<symbol, unknown>)[contextSymbol] = originalContext;
  vi.clearAllMocks();
});

function setup(storySlides: string | null = null, changes = 1) {
  const first = vi.fn().mockResolvedValue({ storySlides, owned: 1 });
  const run = vi.fn().mockResolvedValue({ meta: { changes } });
  const bind = vi.fn().mockReturnValue({ first, run });
  const prepare = vi.fn().mockReturnValue({ bind });
  mocks.reader.mockReturnValue({ prepare });
  const bucket = { put: vi.fn().mockResolvedValue({}), get: vi.fn(), delete: vi.fn().mockResolvedValue(undefined) };
  process.env = { ...originalEnvironment, SUPABASE_READ_ONLY: "true", AUTH_MAIL_MODE: "outbox" };
  (globalThis as Record<symbol, unknown>)[contextSymbol] = { env: { STORY_PREVIEW_MEDIA: bucket } };
  return { first, run, bind, prepare, bucket };
}

describe("preview story media writer", () => {
  it("checks exact ownership and stores versioned PNG keys in D1", async () => {
    const { run, bind, prepare, bucket } = setup();
    expect(await previewStoryOwner(id, "owner-id")).toBe(true);
    expect(prepare.mock.calls[0][0]).toContain("o.clerkUserId = ?");
    expect(prepare.mock.calls[0][0]).not.toContain("isPublic");
    const saved = await savePreviewStoryMedia(id, "owner-id", form(), "free", 7);
    expect(saved?.slides.cover).toMatch(new RegExp(`^https://localley-next-preview\\.nkopp\\.workers\\.dev/api/itineraries/${id}/story/media/[0-9a-f-]+/cover\\?data_candidate=d1$`));
    expect(saved?.retentionDays).toBe(7);
    expect(bucket.put).toHaveBeenCalledTimes(1);
    const key = bucket.put.mock.calls[0][0] as string;
    expect(key).toMatch(new RegExp(`^story-slides/${id}/[0-9a-f-]+/cover\\.png$`));
    expect(bucket.put.mock.calls[0][1]).toEqual(png);
    expect(bucket.put.mock.calls[0][2]).toEqual({ httpMetadata: { contentType: "image/png" } });
    expect(run).toHaveBeenCalledTimes(1);
    expect(bind.mock.calls.at(-1)?.[0]).toContain(`r2://${key}`);
    expect(prepare.mock.calls.at(-1)?.[0]).toContain("o.clerkUserId = ?");
  });

  it("rejects invalid PNG bytes before any R2 write", async () => {
    const { bucket, run } = setup();
    const bad = new FormData(); bad.append("cover", new Blob(["not-png"], { type: "image/png" }));
    await expect(savePreviewStoryMedia(id, "owner-id", bad, "free", 7)).rejects.toThrow(RangeError);
    expect(bucket.put).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("deletes only the new generation if the owner-scoped D1 write fails", async () => {
    const oldKey = `story-slides/${id}/22222222-2222-4222-8222-222222222222/cover.png`;
    const { bucket } = setup(JSON.stringify({ slides: { cover: `r2://${oldKey}` } }), 0);
    await expect(savePreviewStoryMedia(id, "owner-id", form(), "free", 7)).rejects.toThrow("did not match owner");
    const freshKey = bucket.put.mock.calls[0][0] as string;
    expect(freshKey).not.toBe(oldKey);
    expect(bucket.delete).toHaveBeenCalledExactlyOnceWith(freshKey);
  });

  it("keeps new files if D1 applied the write before losing its response", async () => {
    const { first, bind, run, bucket } = setup();
    run.mockRejectedValue(new Error("D1 response lost"));
    first.mockResolvedValueOnce({ storySlides: null }).mockImplementationOnce(async () =>
      ({ storySlides: bind.mock.calls[1][0] }));
    await expect(savePreviewStoryMedia(id, "owner-id", form(), "free", 7)).rejects.toThrow("D1 response lost");
    expect(bucket.put).toHaveBeenCalledTimes(1);
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it("does not turn imported HTTPS sources into R2 routes", () => {
    expect(previewStoryMediaUrl(id, "https://example.com/old.png")).toBe("https://example.com/old.png");
    expect(() => previewStoryMediaUrl(id, "r2://story-slides/other/id/cover.png")).toThrow();
  });
});

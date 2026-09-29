// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), bucket: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/app-data/preview-story-media", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-story-media")>(),
  previewStoryBucket: mocks.bucket,
}));

import { cleanupPreviewStories } from "@/lib/app-data/preview-story-cleanup";

const id = "11111111-1111-4111-8111-111111111111";
const key = `story-slides/${id}/22222222-2222-4222-8222-222222222222/cover.png`;
const expired = JSON.stringify({ expires_at: "2026-01-01T00:00:00.000Z", slides: { cover: `r2://${key}` } });
const future = JSON.stringify({ expires_at: "2027-01-01T00:00:00.000Z", slides: { cover: `r2://${key}` } });
afterEach(() => vi.clearAllMocks());

function setup(storySlides: string | null, changes = 1) {
  const all = vi.fn().mockResolvedValue({ results: storySlides === null ? [] : [{ itineraryId: id, storySlides }] });
  const run = vi.fn().mockResolvedValue({ meta: { changes } });
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ all, bind });
  mocks.reader.mockReturnValue({ prepare });
  const bucket = { delete: vi.fn().mockResolvedValue(undefined) };
  mocks.bucket.mockReturnValue(bucket);
  return { all, run, bind, prepare, bucket };
}

describe("preview story cleanup", () => {
  it("returns the existing zero-work shape without touching R2", async () => {
    setup(null);
    expect(await cleanupPreviewStories(new Date("2026-09-29"))).toEqual({ success: true, cleaned: 0 });
    expect(mocks.bucket).not.toHaveBeenCalled();
  });

  it("does not delete a story before its expiry", async () => {
    const { run } = setup(future);
    expect(await cleanupPreviewStories(new Date("2026-09-29"))).toEqual({ success: true, cleaned: 0 });
    expect(run).not.toHaveBeenCalled();
  });

  it("deletes only validated preview R2 media, then compare-and-sets its D1 snapshot", async () => {
    const { bucket, bind, prepare } = setup(expired);
    expect(await cleanupPreviewStories(new Date("2026-09-29"))).toEqual({
      success: true, cleaned: 1, filesDeleted: 1, total: 1,
    });
    expect(bucket.delete).toHaveBeenCalledExactlyOnceWith(key);
    expect(prepare.mock.calls[1][0]).toContain("storySlides = ?");
    expect(bind).toHaveBeenCalledExactlyOnceWith(id, expired);
    expect(bucket.delete.mock.invocationCallOrder[0]).toBeLessThan(bind.mock.invocationCallOrder[0]);
  });

  it("keeps metadata when R2 deletion fails", async () => {
    const { bucket, run } = setup(expired);
    bucket.delete.mockRejectedValue(new Error("R2 unavailable"));
    await expect(cleanupPreviewStories(new Date("2026-09-29"))).rejects.toThrow("R2 unavailable");
    expect(run).not.toHaveBeenCalled();
  });

  it("skips a changed D1 snapshot without clearing a new story", async () => {
    const { run } = setup(expired, 0);
    expect(await cleanupPreviewStories(new Date("2026-09-29"))).toEqual({
      success: true, cleaned: 0, filesDeleted: 1, total: 1,
    });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rejects unmigrated media and another itinerary key before deletion", async () => {
    const bad = JSON.stringify({ expires_at: "2026-01-01T00:00:00.000Z",
      slides: { cover: "https://old.example/story.png" } });
    const invalid = setup(bad);
    await expect(cleanupPreviewStories(new Date("2026-09-29"))).rejects.toThrow("Unmigrated");
    expect(invalid.bucket.delete).not.toHaveBeenCalled();
    expect(invalid.run).not.toHaveBeenCalled();
    const copied = JSON.stringify({ expires_at: "2026-01-01T00:00:00.000Z",
      slides: { cover: `r2://story-slides/33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222/cover.png` } });
    const other = setup(copied);
    await expect(cleanupPreviewStories(new Date("2026-09-29"))).rejects.toThrow("Invalid preview story media key");
    expect(other.bucket.delete).not.toHaveBeenCalled();
    expect(other.run).not.toHaveBeenCalled();
  });
});

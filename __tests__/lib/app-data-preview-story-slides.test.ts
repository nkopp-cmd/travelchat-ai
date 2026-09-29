import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), first: vi.fn(), bind: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));

import { previewStorySlides } from "@/lib/app-data/preview-story-slides";

afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

describe("preview story slide metadata", () => {
  it("binds exact itinerary and owner, then returns unexpired slide fields", async () => {
    mocks.prepare.mockReturnValue({ bind: mocks.bind });
    mocks.bind.mockReturnValue({ first: mocks.first });
    mocks.reader.mockReturnValue({ prepare: mocks.prepare });
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    mocks.first.mockResolvedValue({ storySlides: JSON.stringify({
      generated_at: "2026-09-29T11:00:00Z", expires_at: "2026-09-30T11:00:00Z",
      tier: "pro", slides: { cover: "https://example.com/cover.png" },
    }) });
    expect(await previewStorySlides("trip-id", "owner-id")).toEqual({
      success: true, available: true, expired: false,
      slides: { cover: "https://example.com/cover.png" },
      generatedAt: "2026-09-29T11:00:00Z", expiresAt: "2026-09-30T11:00:00Z", tier: "pro",
    });
    expect(mocks.bind).toHaveBeenCalledWith("trip-id", "owner-id");
    expect(mocks.prepare.mock.calls[0][0]).toContain("m.isPublic = 1 OR o.clerkUserId = ?");
  });

  it("hides absent records and expires old slides", async () => {
    mocks.prepare.mockReturnValue({ bind: mocks.bind });
    mocks.bind.mockReturnValue({ first: mocks.first });
    mocks.reader.mockReturnValue({ prepare: mocks.prepare });
    mocks.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ storySlides: null })
      .mockResolvedValueOnce({ storySlides: JSON.stringify({
        generated_at: "2026-09-01T00:00:00Z", expires_at: "2026-09-02T00:00:00Z",
        tier: "free", slides: { cover: "https://example.com/cover.png" },
      }) });
    expect(await previewStorySlides("trip-id", "other-id")).toBeNull();
    expect(await previewStorySlides("trip-id", null)).toEqual({ success: true, available: false });
    expect(mocks.bind).toHaveBeenNthCalledWith(2, "trip-id", "");
    expect(await previewStorySlides("trip-id", "owner-id")).toMatchObject({
      available: false, expired: true, slides: null,
    });
  });

  it("rejects malformed imported metadata", async () => {
    mocks.prepare.mockReturnValue({ bind: mocks.bind });
    mocks.bind.mockReturnValue({ first: mocks.first });
    mocks.reader.mockReturnValue({ prepare: mocks.prepare });
    mocks.first.mockResolvedValue({ storySlides: '{"slides":{"cover":4}}' });
    await expect(previewStorySlides("trip-id", "owner-id")).rejects.toThrow("Invalid story slides");
  });

  it("maps only current preview R2 keys while preserving imported HTTPS URLs", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const generation = "22222222-2222-4222-8222-222222222222";
    mocks.prepare.mockReturnValue({ bind: mocks.bind });
    mocks.bind.mockReturnValue({ first: mocks.first });
    mocks.reader.mockReturnValue({ prepare: mocks.prepare });
    mocks.first.mockResolvedValue({ storySlides: JSON.stringify({
      generated_at: "2026-09-29T00:00:00Z", expires_at: "2099-01-01T00:00:00Z", tier: "free",
      slides: { cover: `r2://story-slides/${id}/${generation}/cover.png`,
        day1: "https://example.com/imported.png" },
    }) });
    expect(await previewStorySlides(id, "owner-id")).toMatchObject({ slides: {
      cover: `https://localley-next-preview.nkopp.workers.dev/api/itineraries/${id}/story/media/${generation}/cover?data_candidate=d1`,
      day1: "https://example.com/imported.png",
    } });
  });
});

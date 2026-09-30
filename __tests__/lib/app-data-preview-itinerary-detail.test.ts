import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), first: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewItineraryDetailCandidate, previewItineraryDetail } from "@/lib/app-data/preview-itinerary-detail";

const id = "550e8400-e29b-41d4-a716-446655440000";
const row = { id, ownerId: "user_one", ownerSource: "legacy-fixture", legacyUserId: "user_one",
  title: "Seoul", city: "Seoul", days: 2, activities: "[]", highlights: '["market"]',
  estimated_cost: "$50", subtitle: null, local_score: 5, created_at: "2026-09-01T00:00:00Z",
  status: "completed", is_favorite: 1, shared: 0, share_code: null,
  is_public: 0, like_count: 2, view_count: 3, source_profile_id: null,
  ai_backgrounds: "{}", story_slides: null };
const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("preview itinerary detail", () => {
  it("requires exact preview host, flag and isolated environment", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const req = (host: string, flag = "?data_candidate=d1") => new NextRequest(`https://${host}/api/itineraries/${id}${flag}`);
    expect(isPreviewItineraryDetailCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewItineraryDetailCandidate(req("www.localley.io"))).toBe(false);
    expect(isPreviewItineraryDetailCandidate(req("localley-next-preview.nkopp.workers.dev", ""))).toBe(false);
    process.env = { ...process.env, SUPABASE_READ_ONLY: "false" };
    expect(isPreviewItineraryDetailCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("reads exact history for its owner and blocks another user", async () => {
    const bind = vi.fn(() => ({ first: mocks.first }));
    const prepare = vi.fn(() => ({ bind }));
    mocks.reader.mockReturnValue({ prepare });
    mocks.first.mockResolvedValue(row);
    const own = await previewItineraryDetail(id.toUpperCase(), "user_one");
    expect(own).toMatchObject({ state: "found", itinerary: { clerk_user_id: "user_one",
      activities: [], highlights: ["market"], is_favorite: true, is_public: false } });
    expect(bind).toHaveBeenCalledWith(id);
    expect(prepare.mock.calls[0][0]).toContain("WHERE i.id = ?");
    expect(await previewItineraryDetail(id, "user_two")).toEqual({ state: "forbidden" });
  });

  it("permits explicit public history and fresh exact owners", async () => {
    mocks.reader.mockReturnValue({ prepare: () => ({ bind: () => ({ first: mocks.first }) }) });
    mocks.first.mockResolvedValueOnce({ ...row, is_public: 1 })
      .mockResolvedValueOnce({ ...row, ownerId: "auth:new_user", ownerSource: "new", legacyUserId: null });
    expect((await previewItineraryDetail(id, "user_two")).state).toBe("found");
    expect(await previewItineraryDetail(id, "new_user")).toMatchObject({ state: "found",
      itinerary: { clerk_user_id: "new_user" } });
  });

  it("returns missing for absent IDs and rejects malformed history", async () => {
    mocks.reader.mockReturnValue({ prepare: () => ({ bind: () => ({ first: mocks.first }) }) });
    mocks.first.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...row, activities: "not-json" })
      .mockResolvedValueOnce({ ...row, ownerSource: "new" });
    expect(await previewItineraryDetail("bad", "user_one")).toEqual({ state: "missing" });
    expect(await previewItineraryDetail(id, "user_one")).toEqual({ state: "missing" });
    await expect(previewItineraryDetail(id, "user_one")).rejects.toThrow();
    await expect(previewItineraryDetail(id, "user_one")).rejects.toThrow();
  });
});

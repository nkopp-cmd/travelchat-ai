import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), reader: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/app-data/preview-itinerary-detail", () => ({ previewItineraryDetail: mocks.read }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { updatePreviewItinerary } from "@/lib/app-data/preview-itinerary-update";

const id = "550e8400-e29b-41d4-a716-446655440000";
const input = { title: "Updated Seoul", city: "Seoul", activities: { dailyPlans: [{ day: 1, activities: [] }] },
  highlights: ["market"], estimatedCost: "$50" };
const owned = { state: "found", itinerary: { id, clerk_user_id: "user_one", title: "Seoul" } };
beforeEach(() => {
  mocks.read.mockResolvedValue(owned);
  mocks.run.mockResolvedValue({ meta: { changes: 1 } });
  mocks.reader.mockReturnValue({ prepare: () => ({ bind: () => ({ run: mocks.run }) }) });
});
afterEach(() => vi.clearAllMocks());

describe("preview itinerary update", () => {
  it("guards one owner write and returns the updated normalized detail", async () => {
    const bind = vi.fn(() => ({ run: mocks.run }));
    const prepare = vi.fn(() => ({ bind }));
    mocks.reader.mockReturnValue({ prepare });
    const result = await updatePreviewItinerary(id.toUpperCase(), "user_one", input);
    expect(result).toMatchObject({ state: "found", itinerary: { title: "Updated Seoul", activities: input.activities } });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0][0]).toContain("ownerId IN");
    expect(bind.mock.calls[0]).toEqual([input.title, input.city, JSON.stringify(input.activities),
      JSON.stringify(input.highlights), "$50", id, "user_one", "auth:user_one"]);
  });

  it("denies a foreign public itinerary and a missing row before writing", async () => {
    mocks.read.mockResolvedValueOnce({ state: "found", itinerary: { ...owned.itinerary, clerk_user_id: "user_two", is_public: true } })
      .mockResolvedValueOnce({ state: "missing" });
    expect(await updatePreviewItinerary(id, "user_one", input)).toEqual({ state: "forbidden" });
    expect(await updatePreviewItinerary(id, "user_one", input)).toEqual({ state: "missing" });
    expect(mocks.reader).not.toHaveBeenCalled();
  });

  it("rejects oversized or invalid fields before reading", async () => {
    await expect(updatePreviewItinerary(id, "user_one", { ...input, title: "x".repeat(201) })).rejects.toThrow(RangeError);
    await expect(updatePreviewItinerary(id, "user_one", { ...input, highlights: "bad" })).rejects.toThrow(RangeError);
    await expect(updatePreviewItinerary(id, "user_one", { ...input, activities: null })).rejects.toThrow(RangeError);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("fails closed when D1 does not update exactly one row", async () => {
    mocks.run.mockResolvedValue({ meta: { changes: 0 } });
    await expect(updatePreviewItinerary(id, "user_one", input)).rejects.toThrow("Preview itinerary update failed");
  });
});

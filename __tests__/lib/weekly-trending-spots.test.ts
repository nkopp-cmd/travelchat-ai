import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  unstable_cache: (callback: () => unknown) => callback,
}));
vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
}));

import { fetchWeeklyTrendingSpots } from "@/lib/spots/weekly-trending";

describe("weekly trending spots loader", () => {
  afterEach(() => {
    delete process.env.WEEKLY_SOCIAL_TRENDS_ENABLED;
    vi.clearAllMocks();
  });

  it("returns no public section and performs no query while disabled", async () => {
    process.env.WEEKLY_SOCIAL_TRENDS_ENABLED = "false";

    await expect(fetchWeeklyTrendingSpots(null)).resolves.toEqual([]);
    expect(mocks.createSupabaseAdmin).not.toHaveBeenCalled();
  });
});

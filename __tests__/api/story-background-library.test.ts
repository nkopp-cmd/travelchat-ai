// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LIB = `/media/story/${"a".repeat(64)}.jpg`;
const mocks = vi.hoisted(() => ({ auth: vi.fn(), tier: vi.fn(), weighted: vi.fn(), library: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier, checkAndIncrementUsageWeighted: mocks.weighted }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => async () => null }));
vi.mock("@/lib/image-library", () => ({ nearestLibraryStoryBackground: mocks.library }));
import { POST } from "@/app/api/images/story-background/route";

const post = (extra: Record<string, unknown> = {}) => POST(new NextRequest("https://www.localley.io/api/images/story-background", {
  method: "POST", body: JSON.stringify({ type: "day", dayNumber: 2, city: "Seoul", excludeUrls: ["/media/story/x.jpg"], ...extra }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ userId: "u1" });
  mocks.tier.mockResolvedValue("pro");
  mocks.weighted.mockResolvedValue({ allowed: true, usage: {} });
  mocks.library.mockReturnValue(LIB);
});
afterEach(() => vi.restoreAllMocks());

describe("story backgrounds: painted library only, never a paid image API (Nils 2026-11-14)", () => {
  it("serves the nearest library image without a credit", async () => {
    expect(await (await post()).json()).toMatchObject({ success: true, image: LIB, source: "library" });
    expect(mocks.library).toHaveBeenCalledWith("Seoul", "day", 2, ["/media/story/x.jpg"]);
    expect(mocks.weighted).not.toHaveBeenCalled();
  });

  it("returns the gradient answer when every library image is excluded, without any generation", async () => {
    mocks.library.mockReturnValue(null);
    expect(await (await post()).json()).toMatchObject({ success: false });
    expect(mocks.weighted).not.toHaveBeenCalled();
  });

  it("keeps the paid tier gate: a free user gets no library image", async () => {
    mocks.tier.mockResolvedValue("free");
    expect((await (await post()).json()).image).toBeUndefined();
    expect(mocks.library).not.toHaveBeenCalled();
  });

  it("skips the library when the user turned AI backgrounds off", async () => {
    await post({ preferAI: false });
    expect(mocks.library).not.toHaveBeenCalled();
  });
});

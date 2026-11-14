// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LIB = `/media/story/${"a".repeat(64)}.jpg`;
const mocks = vi.hoisted(() => ({ auth: vi.fn(), tier: vi.fn(), weighted: vi.fn(), generate: vi.fn(), library: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier, checkAndIncrementUsageWeighted: mocks.weighted }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => async () => null }));
vi.mock("@/lib/imagen", () => ({ isImagenAvailable: () => true }));
vi.mock("@/lib/image-provider", () => ({ getImageProvider: () => "gemini", isAnyProviderAvailable: () => true, generateStoryBackground: mocks.generate, generateDayBackground: mocks.generate }));
vi.mock("@/lib/image-library", () => ({ libraryStoryBackground: mocks.library }));
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

describe("story backgrounds: pre-generated library before the paid API (reach-engine R8)", () => {
  it("serves a library hit without a credit and without a Gemini call", async () => {
    expect(await (await post()).json()).toMatchObject({ success: true, image: LIB, source: "library" });
    expect(mocks.library).toHaveBeenCalledWith("Seoul", "day", 2, ["/media/story/x.jpg"]);
    expect(mocks.weighted).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
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

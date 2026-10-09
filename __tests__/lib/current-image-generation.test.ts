import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: mocks.generate }; } }));
vi.mock("@/lib/flux", () => ({ isFluxAvailable: () => true, generateStoryBackground: vi.fn() }));
vi.mock("@/lib/seedream", () => ({ isSeedreamAvailable: () => true, generateStoryBackground: vi.fn() }));
describe("current image generation", () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv("GEMINI_API_KEY", "test-only"); mocks.generate.mockReset(); });
  afterEach(() => vi.unstubAllEnvs());
  it("sends portrait configuration to the requested model and keeps image bytes", async () => {
    mocks.generate.mockResolvedValue({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "png-bytes" } }] } }] });
    const { generateImage } = await import("@/lib/imagen");
    expect(await generateImage({ prompt: "Seoul cityscape", aspectRatio: "9:16" })).toEqual([{ mimeType: "image/png", imageBytes: "png-bytes" }]);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-nano-banana-2.1",
      config: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "9:16" } } }));
  });
  it("offers one generic option to paid tiers and refuses retired options", async () => {
    const { getAvailableModels, canUseTierModel, getModelCredits } = await import("@/lib/model-credits");
    expect(getAvailableModels("pro")).toEqual([{ provider: "gemini", label: "AI backgrounds", description: "Custom travel backgrounds",
      credits: 3, available: true, tierLocked: false }]);
    expect(getAvailableModels("premium")).toHaveLength(1); expect(getAvailableModels("free")[0].available).toBe(false);
    expect(canUseTierModel("premium", "flux")).toBe(false); expect(canUseTierModel("premium", "seedream")).toBe(false);
    expect(getModelCredits("gemini")).toBe(3);
  });
  it("never switches providers when current image generation fails", async () => {
    mocks.generate.mockRejectedValue(Error("provider unavailable"));
    const { generateStoryBackground, getImageProvider } = await import("@/lib/image-provider");
    expect(getImageProvider("pro")).toBe("gemini");
    await expect(generateStoryBackground("gemini", "Seoul", "cityscape")).rejects.toThrow("provider unavailable");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    await expect(generateStoryBackground("flux", "Seoul", "cityscape")).rejects.toThrow("no longer available");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});

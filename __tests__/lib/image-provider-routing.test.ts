// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flux from "@/lib/flux";
import * as seedream from "@/lib/seedream";
import * as gemini from "@/lib/imagen";
import * as gptImage from "@/lib/gpt-image";
import {
    generateDayBackground,
    generateStoryBackground,
    getImageProvider,
    isAnyProviderAvailable,
} from "@/lib/image-provider";
import { canUseTierModel, getAvailableModels, getModelCredits } from "@/lib/model-credits";

vi.mock("@/lib/flux", () => ({
    isFluxAvailable: vi.fn(),
    generateStoryBackground: vi.fn(),
    generateDayBackground: vi.fn(),
}));
vi.mock("@/lib/seedream", () => ({
    isSeedreamAvailable: vi.fn(),
    generateStoryBackground: vi.fn(),
    generateDayBackground: vi.fn(),
}));
vi.mock("@/lib/imagen", () => ({
    isImagenAvailable: vi.fn(),
    generateStoryBackground: vi.fn(),
    generateDayBackground: vi.fn(),
}));
vi.mock("@/lib/gpt-image", async (importOriginal) => ({
    ...await importOriginal<typeof import("@/lib/gpt-image")>(),
    generateStoryBackground: vi.fn(),
    generateDayBackground: vi.fn(),
}));

describe("image provider routing and model credits (offline)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BYPASS_IMAGE_TIER_CHECK", "false");
        vi.stubEnv("ENABLE_GPT_IMAGE_2", "true");
        vi.stubEnv("OPENAI_API_KEY", "test-key-not-live");
        vi.stubEnv("GPT_IMAGE_2_CREDITS", "7");
        vi.mocked(flux.isFluxAvailable).mockReturnValue(true);
        vi.mocked(seedream.isSeedreamAvailable).mockReturnValue(true);
        vi.mocked(gemini.isImagenAvailable).mockReturnValue(true);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each([true, false])("never auto-selects an image model for free (FLUX available: %s)", (available) => {
        vi.mocked(flux.isFluxAvailable).mockReturnValue(available);
        expect(getImageProvider("free")).toBeNull();
        expect(getAvailableModels("free").every(model => !model.available && model.tierLocked)).toBe(true);
    });

    it("limits Pro automatic selection to FLUX, even with both locked providers available", () => {
        expect(getImageProvider("pro")).toBe("flux");
        vi.mocked(flux.isFluxAvailable).mockReturnValue(false);
        expect(getImageProvider("pro")).toBeNull();
        for (const provider of ["seedream", "gemini"] as const) {
            expect(canUseTierModel("pro", provider)).toBe(false);
            expect(getAvailableModels("pro")).toContainEqual(expect.objectContaining({
                provider, available: false, tierLocked: true,
            }));
        }
    });

    it("retains Premium priority: FLUX, Seedream, then Gemini", () => {
        expect(getImageProvider("premium")).toBe("flux");
        vi.mocked(flux.isFluxAvailable).mockReturnValue(false);
        expect(getImageProvider("premium")).toBe("seedream");
        vi.mocked(seedream.isSeedreamAvailable).mockReturnValue(false);
        expect(getImageProvider("premium")).toBe("gemini");
    });

    it.each(["false", "true"])("never auto-selects GPT, including with bypass=%s", (bypass) => {
        vi.stubEnv("BYPASS_IMAGE_TIER_CHECK", bypass);
        vi.mocked(flux.isFluxAvailable).mockReturnValue(false);
        vi.mocked(seedream.isSeedreamAvailable).mockReturnValue(false);
        vi.mocked(gemini.isImagenAvailable).mockReturnValue(false);
        expect(isAnyProviderAvailable()).toBe(true);
        for (const tier of ["free", "pro", "premium"] as const) {
            expect(getImageProvider(tier)).toBeNull();
        }
        vi.stubEnv("ENABLE_GPT_IMAGE_2", "false");
        expect(isAnyProviderAvailable()).toBe(false);
    });

    it.each(["1", "7", "23"])("lists configured GPT credits (%s), unlocked only for Premium", (credits) => {
        vi.stubEnv("GPT_IMAGE_2_CREDITS", credits);
        expect(getModelCredits("gpt-image-2")).toBe(Number(credits));
        for (const tier of ["free", "pro", "premium"] as const) {
            expect(canUseTierModel(tier, "gpt-image-2")).toBe(tier === "premium");
            expect(getAvailableModels(tier)).toContainEqual(expect.objectContaining({
                provider: "gpt-image-2",
                credits: Number(credits),
                available: tier === "premium",
                tierLocked: tier !== "premium",
            }));
        }
    });

    it.each([
        ["ENABLE_GPT_IMAGE_2", undefined],
        ["ENABLE_GPT_IMAGE_2", "false"],
        ["ENABLE_GPT_IMAGE_2", "TRUE"],
        ["OPENAI_API_KEY", undefined],
        ["OPENAI_API_KEY", ""],
        ["OPENAI_API_KEY", "   "],
        ...[undefined, "", "0", "-1", "1.5", "NaN", "Infinity", "2credits", "9007199254740992"]
            .map(value => ["GPT_IMAGE_2_CREDITS", value] as const),
    ])("omits GPT for invalid %s=%s, even with bypass", (name, value) => {
        vi.stubEnv(name, value);
        for (const bypass of ["false", "true"]) {
            vi.stubEnv("BYPASS_IMAGE_TIER_CHECK", bypass);
            for (const tier of ["free", "pro", "premium"] as const) {
                expect(getAvailableModels(tier).map(model => model.provider)).not.toContain("gpt-image-2");
            }
            expect(getModelCredits("gpt-image-2")).toBe(0);
        }
    });

    it("bypasses tier locks without making unavailable providers available", () => {
        vi.stubEnv("BYPASS_IMAGE_TIER_CHECK", "true");
        vi.mocked(flux.isFluxAvailable).mockReturnValue(false);
        vi.mocked(seedream.isSeedreamAvailable).mockReturnValue(false);
        vi.mocked(gemini.isImagenAvailable).mockReturnValue(false);
        const models = getAvailableModels("free");
        for (const provider of ["flux", "seedream", "gemini"] as const) {
            expect(models).toContainEqual(expect.objectContaining({ provider, available: false, tierLocked: false }));
        }
        expect(models).toContainEqual(expect.objectContaining({ provider: "gpt-image-2", available: true, tierLocked: false }));
        expect(getImageProvider("free")).toBeNull();
        vi.mocked(seedream.isSeedreamAvailable).mockReturnValue(true);
        expect(getImageProvider("free")).toBe("seedream");
    });

    it("preserves existing model costs", () => {
        expect(getModelCredits("flux")).toBe(1);
        expect(getModelCredits("seedream")).toBe(2);
        expect(getModelCredits("gemini")).toBe(3);
    });

    it.each(["story", "day"] as const)("routes explicit GPT %s generation without fallback on failure", async (kind) => {
        const activities = ["Temple visit", "Market walk"];
        const generate = kind === "story" ? gptImage.generateStoryBackground : gptImage.generateDayBackground;
        const call = () => kind === "story"
            ? generateStoryBackground("gpt-image-2", "Seoul", "Quiet alleys", "artistic")
            : generateDayBackground("gpt-image-2", "Seoul", 2, "Quiet alleys", activities);
        vi.mocked(generate).mockResolvedValue("mock-base64");
        await expect(call()).resolves.toBe("mock-base64");
        expect(generate).toHaveBeenCalledExactlyOnceWith(...(kind === "story"
            ? ["Seoul", "Quiet alleys", "artistic"]
            : ["Seoul", 2, "Quiet alleys", activities]));

        const error = new Error("GPT generation failed");
        vi.mocked(generate).mockRejectedValueOnce(error);
        await expect(call()).rejects.toBe(error);
        expect(generate).toHaveBeenCalledTimes(2);
        const otherGptGenerate = kind === "story" ? gptImage.generateDayBackground : gptImage.generateStoryBackground;
        expect(otherGptGenerate).not.toHaveBeenCalled();
        for (const provider of [flux, seedream, gemini]) {
            expect(provider.generateStoryBackground).not.toHaveBeenCalled();
            expect(provider.generateDayBackground).not.toHaveBeenCalled();
        }
    });
});

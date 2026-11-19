// Push AQ1: property tests for the paid image gate (lib/model-credits.ts + the tier config in lib/subscription.ts).
// The story-background route lets a Gemini call through only when canUseTierModel and hasFeature("aiBackgrounds")
// agree; a drift in either config would open paid image calls to free users. Pure functions only.
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

const imagen = vi.hoisted(() => ({ available: true }));
vi.mock("@/lib/imagen", () => ({ isImagenAvailable: () => imagen.available }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import type { ImageProvider } from "@/lib/image-provider";
import { MODEL_CREDITS, TIER_MODELS, canUseTierModel, getAvailableModels, getModelCredits } from "@/lib/model-credits";
import { TIER_CONFIGS, hasFeature, type SubscriptionTier } from "@/lib/subscription";

const TIERS = Object.keys(TIER_CONFIGS) as SubscriptionTier[];
const PROVIDERS = Object.keys(MODEL_CREDITS) as ImageProvider[];
const tier = fc.constantFrom(...TIERS);
const provider = fc.constantFrom(...PROVIDERS);
const bypass = fc.constantFrom<string | undefined>(undefined, "", "false", "TRUE", "1", "true");
const originalBypass = process.env.BYPASS_IMAGE_TIER_CHECK;

function setBypass(value: string | undefined) {
    if (value === undefined) delete process.env.BYPASS_IMAGE_TIER_CHECK;
    else process.env.BYPASS_IMAGE_TIER_CHECK = value;
}

afterEach(() => {
    setBypass(originalBypass);
    imagen.available = true;
});

describe("paid image gate (property)", () => {
    it("every provider costs a whole number of credits >= 1", () => {
        fc.assert(fc.property(provider, (p) => {
            const credits = getModelCredits(p);
            expect(Number.isInteger(credits)).toBe(true);
            expect(credits).toBeGreaterThanOrEqual(1);
        }));
    });

    it("without the exact bypass flag, a usable model implies the tier sells AI backgrounds and has the monthly credits for one image", () => {
        fc.assert(fc.property(tier, provider, bypass.filter((b) => b !== "true"), (t, p, b) => {
            setBypass(b);
            if (!canUseTierModel(t, p)) return;
            expect(hasFeature(t, "aiBackgrounds")).toBe(true);
            expect(TIER_CONFIGS[t].limits.aiImagesPerMonth).toBeGreaterThanOrEqual(getModelCredits(p));
            expect(TIER_MODELS[t]).toContain(p);
        }));
    });

    it("the free tier never gets a model and never sells AI backgrounds, whatever the provider", () => {
        fc.assert(fc.property(provider, bypass.filter((b) => b !== "true"), (p, b) => {
            setBypass(b);
            expect(canUseTierModel("free", p)).toBe(false);
            expect(hasFeature("free", "aiBackgrounds")).toBe(false);
            expect(TIER_CONFIGS.free.limits.aiImagesPerMonth).toBe(0);
        }));
    });

    it("a retired provider is never usable, even with the bypass flag", () => {
        fc.assert(fc.property(tier, provider.filter((p) => p !== "gemini"), bypass, (t, p, b) => {
            setBypass(b);
            expect(canUseTierModel(t, p)).toBe(false);
            expect(getAvailableModels(t).some((m) => m.provider === p)).toBe(false);
        }));
    });

    it("getAvailableModels agrees with canUseTierModel and the API key", () => {
        fc.assert(fc.property(tier, bypass, fc.boolean(), (t, b, key) => {
            setBypass(b);
            imagen.available = key;
            for (const model of getAvailableModels(t)) {
                expect(model.available).toBe(key && canUseTierModel(t, model.provider));
                expect(model.credits).toBe(getModelCredits(model.provider));
                if (b !== "true") expect(model.tierLocked).toBe(!canUseTierModel(t, model.provider));
                else expect(model.tierLocked).toBe(false);
            }
        }));
    });

    it("a higher tier never loses a model or AI background access that a lower tier has", () => {
        const order: SubscriptionTier[] = ["free", "pro", "premium"];
        expect([...TIERS].sort()).toEqual([...order].sort());
        fc.assert(fc.property(fc.integer({ min: 0, max: 1 }), provider, (i, p) => {
            setBypass(undefined);
            const lower = order[i];
            const higher = order[i + 1];
            if (canUseTierModel(lower, p)) expect(canUseTierModel(higher, p)).toBe(true);
            if (hasFeature(lower, "aiBackgrounds")) expect(hasFeature(higher, "aiBackgrounds")).toBe(true);
        }));
    });
});

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, GET } from "@/app/api/images/story-background/route";

const m = vi.hoisted(() => ({
    auth: vi.fn(), limiter: vi.fn(), tier: vi.fn(), usage: vi.fn(), feature: vi.fn(),
    flux: vi.fn(), seedream: vi.fn(), gemini: vi.fn(), gpt: vi.fn(),
    select: vi.fn(), story: vi.fn(), day: vi.fn(), allowed: vi.fn(), credits: vi.fn(), models: vi.fn(),
    admin: vi.fn(), list: vi.fn(), upload: vi.fn(), url: vi.fn(), submit: vi.fn(), settle: vi.fn(),
    revision: "story-background-v1", model: "gpt-image-2",
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: m.auth }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => m.limiter }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: m.tier, checkAndIncrementUsageWeighted: m.usage }));
vi.mock("@/lib/story-image-jobs", () => ({ reserveStoryImageJob: m.usage, submitStoryImageJob: m.submit, settleStoryImageJob: m.settle }));
vi.mock("@/lib/subscription", () => ({ hasFeature: m.feature, TIER_CONFIGS: { premium: { limits: { aiImagesPerMonth: 200 } } } }));
vi.mock("@/lib/flux", () => ({ isFluxAvailable: m.flux }));
vi.mock("@/lib/seedream", () => ({ isSeedreamAvailable: m.seedream }));
vi.mock("@/lib/imagen", () => ({ isImagenAvailable: m.gemini }));
vi.mock("@/lib/gpt-image", () => ({
    isGptImageAvailable: m.gpt,
    get GPT_IMAGE_PROMPT_REVISION() { return m.revision; },
    get GPT_IMAGE_MODEL() { return m.model; },
}));
vi.mock("@/lib/image-provider", () => ({
    getImageProvider: m.select, isAnyProviderAvailable: () => true,
    generateStoryBackground: m.story, generateDayBackground: m.day,
}));
vi.mock("@/lib/model-credits", () => ({
    canUseTierModel: m.allowed, getModelCredits: m.credits, getAvailableModels: m.models,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: m.admin }));

const valid = { type: "cover", city: "Seoul", cacheKey: "../../shared/cover" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=", "base64");
function request(body: unknown = valid) {
    return new NextRequest("https://localley.io/api/images/story-background", { method: "POST", body: JSON.stringify(body) });
}
function noPaidCalls() {
    expect(m.usage).not.toHaveBeenCalled();
    expect(m.story).not.toHaveBeenCalled();
    expect(m.day).not.toHaveBeenCalled();
}

describe("Story background route cost and storage controls", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BYPASS_IMAGE_TIER_CHECK", "false");
        m.revision = "story-background-v1";
        m.model = "gpt-image-2";
        m.auth.mockResolvedValue({ userId: "user-owner" });
        m.tier.mockResolvedValue("premium");
        m.feature.mockReturnValue(true);
        for (const availability of [m.flux, m.seedream, m.gemini]) availability.mockReturnValue(true);
        m.gpt.mockReturnValue(false);
        m.select.mockReturnValue("flux");
        m.allowed.mockReturnValue(true);
        m.credits.mockImplementation((provider: string) => ({ flux: 1, seedream: 2, gemini: 3, "gpt-image-2": 7 })[provider]);
        m.models.mockReturnValue([]);
        m.usage.mockResolvedValue({ state: "reserved", owner_token: "7cff21b4-ef92-4506-a4d5-e888c83196cd", output_url: null });
        m.story.mockResolvedValue(png.toString("base64"));
        m.day.mockResolvedValue(png.toString("base64"));
        m.list.mockResolvedValue({ data: [], error: null });
        m.upload.mockResolvedValue({ error: null });
        m.url.mockImplementation((path: string) => ({ data: { publicUrl: `https://localley.io/storage/${path}` } }));
        m.admin.mockReturnValue({ storage: { from: () => ({ list: m.list, upload: m.upload, getPublicUrl: m.url }) } });
    });
    afterEach(() => vi.unstubAllEnvs());

    it("authenticates before rate limiting, validation, storage, and billing", async () => {
        m.auth.mockResolvedValue({ userId: null });
        expect((await POST(request(null))).status).toBe(401);
        expect(m.limiter).not.toHaveBeenCalled();
        expect(m.tier).not.toHaveBeenCalled();
        expect(m.admin).not.toHaveBeenCalled();
        noPaidCalls();
    });

    it.each([null, [], {}, { ...valid, type: "other" }, { ...valid, city: 1 }, { ...valid, city: " " },
        { ...valid, city: "x".repeat(201) }, { ...valid, provider: "unknown" }, { ...valid, provider: "__proto__" },
        { ...valid, activities: [1] }, { ...valid, activities: "walk" }, { ...valid, activities: [""] },
        { ...valid, type: "day" }, { ...valid, type: "day", dayNumber: 1.5 }, { ...valid, dayNumber: 0 },
        { ...valid, cacheKey: 1 }, { ...valid, cacheKey: "x".repeat(257) }, { ...valid, excludeUrls: [1] },
        { ...valid, excludeUrls: "url" }, { ...valid, slotIndex: -1 }, { ...valid, slotIndex: 367 },
        { ...valid, slotIndex: 1.5 }, { ...valid, preferAI: "false" }, { ...valid, theme: {} },
    ])("rejects invalid input before credits: %j", async body => {
        vi.stubEnv("BYPASS_IMAGE_TIER_CHECK", "true");
        expect((await POST(request(body))).status).toBe(400);
        expect(m.tier).not.toHaveBeenCalled();
        noPaidCalls();
    });

    it("rejects malformed JSON", async () => {
        const response = await POST(new NextRequest("https://localley.io/api/images/story-background", { method: "POST", body: "{" }));
        expect(response.status).toBe(400);
        noPaidCalls();
    });

    it.each(["true", "false"])("does not bypass GPT availability with tier bypass=%s", async bypass => {
        vi.stubEnv("BYPASS_IMAGE_TIER_CHECK", bypass);
        const response = await POST(request({ ...valid, provider: "gpt-image-2" }));
        expect(response.status).toBe(503);
        expect((await response.json()).error).toMatch(/disabled or unavailable/);
        expect(m.list).not.toHaveBeenCalled();
        noPaidCalls();
    });

    it("advertises GPT availability without enabling it", async () => {
        expect((await (await GET()).json()).sources.gptImage2).toBe(false);
        m.gpt.mockReturnValue(true);
        expect((await (await GET()).json()).sources.gptImage2).toBe(true);
        noPaidCalls();
    });

    it.each([undefined, "false", "TRUE", "1", " true", "true "])("hides video unless every flag is exact true: %s", async value => {
        const flags = ["ENABLE_MINIMAX_H3", "ENABLE_STORY_VIDEO_PROCESSING", "STORY_VIDEO_DELIVERY_READY"];
        vi.stubEnv("MINIMAX_API_KEY", "private-test-key");
        for (const disabled of flags) {
            for (const flag of flags) vi.stubEnv(flag, flag === disabled ? value : "true");
            expect((await (await GET()).json()).videoUiEnabled).toBe(false);
        }
        expect(m.admin).not.toHaveBeenCalled();
        noPaidCalls();
    });

    it.each([undefined, "", "   ", "private-test-key"])("preserves image discovery and requires a nonempty video key: %s", async key => {
        for (const flag of ["ENABLE_MINIMAX_H3", "ENABLE_STORY_VIDEO_PROCESSING", "STORY_VIDEO_DELIVERY_READY"]) vi.stubEnv(flag, "true");
        vi.stubEnv("MINIMAX_API_KEY", key);
        expect(await (await GET()).json()).toEqual({
            sources: { ai: true, flux: true, seedream: true, gemini: true, gptImage2: false },
            models: [], tier: "premium", videoUiEnabled: !!key?.trim(),
        });
        expect(m.admin).not.toHaveBeenCalled();
        noPaidCalls();
    });

    it("never reads paid cache or generates when preferAI is false", async () => {
        const response = await POST(request({ ...valid, preferAI: false, provider: "flux" }));
        expect((await response.json()).success).toBe(false);
        expect(m.list).not.toHaveBeenCalled();
        noPaidCalls();
    });

    it.each([null, "unavailable", "locked", "no-feature"])("does not charge without an eligible model: %s", async state => {
        if (state === null) m.select.mockReturnValue(null);
        if (state === "unavailable") m.flux.mockReturnValue(false);
        if (state === "locked") m.allowed.mockReturnValue(false);
        if (state === "no-feature") m.feature.mockReturnValue(false);
        expect((await (await POST(request())).json()).success).toBe(false);
        noPaidCalls();
    });

    it("rejects an explicit tier-locked provider before cache", async () => {
        m.allowed.mockReturnValue(false);
        expect((await POST(request({ ...valid, provider: "seedream" }))).status).toBe(403);
        expect(m.list).not.toHaveBeenCalled();
        noPaidCalls();
    });

    it.each(["png", "jpg"])("returns exact %s cache hits without billing", async ext => {
        m.list.mockResolvedValue({ data: [{ name: `background.${ext}` }], error: null });
        const response = await POST(request());
        expect(await response.json()).toEqual({ success: true, source: "cache", cached: true,
            image: expect.stringMatching(new RegExp(`/background\\.${ext}$`)) });
        expect(m.list.mock.calls[0][0]).toMatch(/^story-backgrounds\/v2\/[a-f0-9]{64}\/[a-f0-9]{64}$/);
        noPaidCalls();
    });

    it("rejects substring and legacy filename matches, then checks credits", async () => {
        m.list.mockResolvedValue({ data: [{ name: "background.png.bak" }, { name: "old-background.jpg" },
            { name: "../../shared/cover.png" }], error: null });
        expect((await (await POST(request())).json()).source).toBe("ai");
        expect(m.list.mock.invocationCallOrder[0]).toBeLessThan(m.usage.mock.invocationCallOrder[0]);
        expect(m.usage.mock.invocationCallOrder[0]).toBeLessThan(m.story.mock.invocationCallOrder[0]);
    });

    it("isolates cached requests by owner, provider, and every scene field", async () => {
        const paths: string[] = [];
        const run = async (body = valid) => {
            await POST(request(body));
            paths.push(m.list.mock.lastCall![0]);
        };
        await run();
        await run();
        expect(paths.pop()).toBe(paths[0]);
        m.auth.mockResolvedValue({ userId: "other-owner" });
        await run();
        m.auth.mockResolvedValue({ userId: "user-owner" });
        for (const change of [{ provider: "seedream" }, { type: "summary" }, { city: "Tokyo" }, { theme: "food" },
            { type: "day", dayNumber: 1 }, { dayNumber: 2 }, { activities: ["walk"] }, { slotIndex: 2 }, { cacheKey: "other" }]) {
            await run({ ...valid, ...change });
        }
        expect(new Set(paths).size).toBe(paths.length);
    });

    it.each(["revision", "model"] as const)("isolates GPT cache by %s", async field => {
        m.gpt.mockReturnValue(true);
        const body = { ...valid, provider: "gpt-image-2" };
        await POST(request(body));
        const original = m.list.mock.lastCall![0];
        m[field] = "new-version";
        vi.resetModules();
        const updated = await import("@/app/api/images/story-background/route");
        await updated.POST(request(body));
        expect(m.list.mock.lastCall![0]).not.toBe(original);
    });

    it("does not overwrite excluded cached slide URLs", async () => {
        m.list.mockResolvedValue({ data: [{ name: "background.png" }], error: null });
        const cached = await (await POST(request())).json();
        const generated = await (await POST(request({ ...valid, excludeUrls: [cached.image] }))).json();
        expect(generated.source).toBe("ai");
        expect(generated.image).not.toBe(cached.image);
        expect(m.usage).toHaveBeenCalledTimes(1);
    });

    it.each(["flux", "seedream", "gemini", "gpt-image-2"])("charges selected %s provider weight exactly once", async provider => {
        m.gpt.mockReturnValue(true);
        const response = await POST(request({ ...valid, provider }));
        expect((await response.json()).provider).toBe(provider);
        expect(m.usage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ userId: "user-owner", provider, credits: m.credits(provider), limit: 200 }));
        expect(m.submit.mock.invocationCallOrder[0]).toBeLessThan(m.story.mock.invocationCallOrder[0]);
        expect(m.story).toHaveBeenCalledTimes(1);
    });

    it("charges the auto-selected model rather than a default weight", async () => {
        m.select.mockReturnValue("gemini");
        await POST(request({ ...valid, provider: null }));
        expect(m.usage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ provider: "gemini", credits: 3 }));
    });

    it.each([0, -1, NaN, 1.5])("rejects unsafe credit configuration %s", async cost => {
        m.credits.mockReturnValue(cost);
        expect((await POST(request())).status).toBe(503);
        noPaidCalls();
    });

    it.each(["throw", "deny"])("never generates when usage tracking returns %s", async state => {
        if (state === "throw") m.usage.mockRejectedValue(new Error("private database details"));
        else m.usage.mockResolvedValue({ state: "limit", owner_token: null, output_url: null });
        const response = await POST(request());
        expect(response.status).toBe(state === "throw" ? 503 : 200);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(JSON.stringify(body)).not.toContain("private");
        expect(m.story).not.toHaveBeenCalled();
        expect(m.day).not.toHaveBeenCalled();
    });

    it("fails closed on cache lookup errors", async () => {
        m.list.mockResolvedValue({ data: null, error: { message: "private" } });
        expect((await POST(request())).status).toBe(503);
        noPaidCalls();
    });

    it.each([null, {}, [null], [{ name: 1 }]])("fails closed on malformed cache results %j", async data => {
        m.list.mockResolvedValue({ data, error: null });
        expect((await POST(request())).status).toBe(503);
        noPaidCalls();
    });

    it.each([undefined, "https://localley.io/storage/other-owner/background.png", "http://localley.io/image.png"])("rejects uncontrolled cache output %s", async publicUrl => {
        m.list.mockResolvedValue({ data: [{ name: "background.png" }], error: null });
        m.url.mockReturnValue({ data: { publicUrl } });
        expect((await POST(request())).status).toBe(503);
        noPaidCalls();
    });

    it.each([undefined, "flux"])("does not cascade after provider failure in %s mode", async provider => {
        m.story.mockRejectedValue(new Error("private provider body"));
        const response = await POST(request({ ...valid, provider }));
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.success).toBe(false);
        expect(body).not.toHaveProperty("_debug");
        expect(JSON.stringify(body)).not.toContain("private");
        expect(m.story).toHaveBeenCalledTimes(1);
        expect(m.usage).toHaveBeenCalledTimes(1);
    });

    it("passes validated day details to only the day generator", async () => {
        await POST(request({ ...valid, type: "day", dayNumber: 2, theme: "Markets", activities: ["Food stalls"], slotIndex: 2 }));
        expect(m.day).toHaveBeenCalledExactlyOnceWith("flux", "Seoul", 2, "Markets", ["Food stalls"]);
        expect(m.story).not.toHaveBeenCalled();
    });

    it.each(["", "!not-base64!", "eA==", Buffer.from("not an image").toString("base64"),
        Buffer.from("RIFF0000WEBP0000").toString("base64"), Buffer.from([137, 80, 78, 71, 0, 0, 0, 0]).toString("base64"),
        "data:image/webp;base64,UklGRjAwMDBXRUJQMDAwMA==", "A".repeat(4 * Math.ceil(10 * 1024 * 1024 / 3) + 68),
    ].map((image, index) => ({ image, index })))("rejects unsupported or invalid image $index", async ({ image }) => {
        m.story.mockResolvedValue(image);
        expect((await (await POST(request())).json()).success).toBe(false);
        expect(m.upload).not.toHaveBeenCalled();
        expect(m.story).toHaveBeenCalledTimes(1);
    });

    it("uses JPEG magic bytes rather than the declared PNG MIME type", async () => {
        const bytes = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
        m.story.mockResolvedValue(`data:image/png;base64,${bytes.toString("base64")}`);
        const body = await (await POST(request())).json();
        expect(body.success).toBe(true);
        expect(body.image).toMatch(/background\.jpg$/);
        expect(m.upload).toHaveBeenCalledWith(expect.any(String), bytes, { contentType: "image/jpeg", upsert: true });
    });

    it.each(["error", "throw"])("handles upload failure %s without exposing data or retrying", async state => {
        if (state === "error") m.upload.mockResolvedValue({ error: { message: "private storage details" } });
        if (state === "throw") m.upload.mockRejectedValue(new Error("private storage details"));
        const response = await POST(request());
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body.success).toBe(false);
        expect(body).not.toHaveProperty("image");
        expect(JSON.stringify(body)).not.toContain("private");
        expect(m.story).toHaveBeenCalledTimes(1);
        expect(m.usage).toHaveBeenCalledTimes(1);
        expect(m.settle).toHaveBeenCalledWith("user-owner", expect.any(String), expect.any(String), null);
    });

    it("fails closed on missing storage settings before reservation", async () => {
        m.url.mockReturnValue({ data: {} });
        expect((await POST(request())).status).toBe(503);
        noPaidCalls();
    });

    it.each(["reserved", "submitted", "failed"])("does not regenerate a duplicate %s job", async state => {
        m.usage.mockResolvedValue({ state, owner_token: null, output_url: null });
        expect((await POST(request())).status).toBe(state === "failed" ? 200 : 202);
        expect(m.submit).not.toHaveBeenCalled();
        expect(m.story).not.toHaveBeenCalled();
    });

    it("reuses settled output without submission or generation", async () => {
        m.usage.mockImplementation(async input => ({ state: "succeeded", owner_token: null, output_url: `${input.outputPrefix}png` }));
        expect((await (await POST(request())).json()).success).toBe(true);
        expect(m.submit).not.toHaveBeenCalled();
        expect(m.story).not.toHaveBeenCalled();
    });

    it("preserves pending on a lost submission response without provider invocation", async () => {
        m.submit.mockRejectedValue(new Error("database network timeout"));
        expect((await POST(request())).status).toBe(202);
        expect(m.story).not.toHaveBeenCalled();
        expect(m.settle).not.toHaveBeenCalled();
    });

    it.each([false, true])("preserves pending on settlement failure, provider failure=%s", async providerFailure => {
        if (providerFailure) m.story.mockRejectedValue(new Error("provider failure"));
        m.settle.mockRejectedValue(new Error("database network timeout"));
        expect((await POST(request())).status).toBe(202);
        expect(m.story).toHaveBeenCalledTimes(1);
        expect(m.settle).toHaveBeenCalledTimes(1);
        expect(m.settle.mock.calls[0][3]).toEqual(providerFailure ? null : expect.stringMatching(/background.png$/));
    });

    it("deduplicates missing cache keys and separates excluded assets", async () => {
        await POST(request({ type: "cover", city: "Seoul" }));
        const first = m.usage.mock.lastCall![0];
        await POST(request({ type: "cover", city: "Seoul" }));
        expect(m.usage.mock.lastCall![0]).toEqual(first);
        await POST(request({ type: "cover", city: "Seoul", excludeUrls: ["https://localley.io/old.png"] }));
        expect(m.usage.mock.lastCall![0].key).not.toBe(first.key);
    });

    it("invokes one provider for competing duplicate requests", async () => {
        let owned = false;
        m.usage.mockImplementation(async () => {
            const token = owned ? null : "7cff21b4-ef92-4506-a4d5-e888c83196cd";
            owned = true;
            return { state: "reserved", owner_token: token, output_url: null };
        });
        const responses = await Promise.all([POST(request()), POST(request())]);
        expect(responses.map(response => response.status).sort()).toEqual([200, 202]);
        expect(m.story).toHaveBeenCalledTimes(1);
        expect(m.submit).toHaveBeenCalledTimes(1);
    });
});

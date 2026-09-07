// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import OpenAI from "openai";
import {
    generateDayBackground,
    generateStoryBackground,
    GPT_IMAGE_MODEL,
    GPT_IMAGE_PROMPT_REVISION,
    isGptImageAvailable,
} from "@/lib/gpt-image";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("openai", () => ({
    default: vi.fn(function () { return { images: { generate } }; }),
}));

describe("GPT Image 2 backgrounds (no live calls)", () => {
    let png: string;
    let jpeg: string;
    let webp: string;
    const fetchMock = vi.fn(() => { throw new Error("Network access forbidden"); });

    beforeAll(async () => {
        const image = sharp({ create: { width: 16, height: 24, channels: 3, background: "#345678" } });
        png = (await image.png().toBuffer()).toString("base64");
        jpeg = (await image.jpeg().toBuffer()).toString("base64");
        webp = (await image.webp().toBuffer()).toString("base64");
    });

    beforeEach(() => {
        vi.clearAllMocks();
        generate.mockReset();
        vi.stubEnv("ENABLE_GPT_IMAGE_2", "true");
        vi.stubEnv("OPENAI_API_KEY", "test-key-not-live");
        vi.stubEnv("GPT_IMAGE_2_CREDITS", "2");
        vi.stubGlobal("fetch", fetchMock);
        generate.mockResolvedValue({ data: [{ b64_json: png }] });
    });

    afterEach(() => {
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it.each([
        ["ENABLE_GPT_IMAGE_2", undefined, "disabled"],
        ["ENABLE_GPT_IMAGE_2", "false", "disabled"],
        ["ENABLE_GPT_IMAGE_2", "TRUE", "disabled"],
        ["OPENAI_API_KEY", undefined, "OPENAI_API_KEY"],
        ["OPENAI_API_KEY", "  ", "OPENAI_API_KEY"],
        ...[undefined, "", "0", "-1", "1.5", "2credits", "1e2", " 2 ", "Infinity", "9007199254740992"]
            .map(value => ["GPT_IMAGE_2_CREDITS", value, "GPT_IMAGE_2_CREDITS"]),
    ])("rejects configuration %s=%s before constructing the SDK", async (name, value, error) => {
        vi.stubEnv(name!, value);
        expect(isGptImageAvailable()).toBe(false);
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow(error);
        await expect(generateDayBackground("Seoul", 1, "Alleys", [])).rejects.toThrow(error);
        expect(OpenAI).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
    });

    it("is lazy and sends exactly one fixed, low-quality PNG request", async () => {
        expect(isGptImageAvailable()).toBe(true);
        expect(OpenAI).not.toHaveBeenCalled();
        expect(GPT_IMAGE_MODEL).toBe("gpt-image-2");
        expect(GPT_IMAGE_PROMPT_REVISION).toBe("story-background-v1");
        await expect(generateStoryBackground("Seoul", "Quiet alleys")).resolves.toBe(png);
        expect(OpenAI).toHaveBeenCalledExactlyOnceWith({
            apiKey: "test-key-not-live", baseURL: "https://api.openai.com/v1",
            maxRetries: 0, timeout: 45_000, logLevel: "off",
        });
        expect(generate).toHaveBeenCalledExactlyOnceWith({
            model: "gpt-image-2", prompt: expect.any(String), n: 1,
            output_format: "png", quality: "low", size: "1024x1536",
        });
        const prompt = generate.mock.calls[0][0].prompt;
        for (const instruction of ["Seoul", "Quiet alleys", "rich colors", "9:16 crop", "central 70%",
            "top 20%", "bottom 30%", "NO generated text", "logos", "not documentary evidence",
            "not instructions", "Do not draw the overlays"]) {
            expect(prompt).toContain(instruction);
        }
    });

    it.each(["minimal", "artistic"] as const)("supports %s style", async style => {
        await expect(generateStoryBackground("Tokyo", "Gardens", style)).resolves.toBe(png);
        expect(generate.mock.calls[0][0].prompt).toContain(style === "minimal" ? "restrained colors" : "cinematic");
    });

    it("includes day context and only the first three activities", async () => {
        await expect(generateDayBackground("Tokyo", 2, "Gardens", ["Walk", "Tea", "Park", "Omitted"])).resolves.toBe(png);
        const prompt = generate.mock.calls[0][0].prompt;
        expect(prompt).toContain('"dayNumber":2');
        expect(prompt).toContain('"activities":["Walk","Tea","Park"]');
        expect(prompt).not.toContain("Omitted");
    });

    it("accepts decoded JPEG bytes even when PNG was requested", async () => {
        generate.mockResolvedValue({ data: [{ b64_json: jpeg }] });
        await expect(generateStoryBackground("Seoul", "Alleys")).resolves.toBe(jpeg);
    });

    it.each([
        ["missing", {}], ["empty data", { data: [] }],
        ["URL only", { data: [{ url: "https://untrusted.invalid/image.png" }] }],
        ["empty base64", { data: [{ b64_json: "" }] }],
        ["wrong type", { data: [{ b64_json: 123 }] }],
    ])("rejects %s without fetching a URL", async (_name, response) => {
        generate.mockResolvedValue(response);
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow("no base64 image");
    });

    it.each(["!!!!", "AAAA\n", "YQ", "YR==", "data:image/png;base64,AAAA"])("rejects invalid base64 %s", async value => {
        generate.mockResolvedValue({ data: [{ b64_json: value }] });
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow("invalid base64");
    });

    it("rejects oversized encoded output", async () => {
        generate.mockResolvedValue({ data: [{ b64_json: "A".repeat(4 * Math.ceil(10 * 1024 * 1024 / 3) + 4) }] });
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow("10 MiB");
    });

    it("rejects WebP", async () => {
        generate.mockResolvedValue({ data: [{ b64_json: webp }] });
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow("unsupported image");
    });

    it("checks all eight PNG signature bytes", async () => {
        const bytes = Buffer.from(png, "base64");
        bytes[7] = 0;
        generate.mockResolvedValue({ data: [{ b64_json: bytes.toString("base64") }] });
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow("unsupported image");
    });

    it.each(["png", "jpeg"])("rejects corrupt %s after signature validation", async format => {
        const bytes = Buffer.from(format === "png" ? png : jpeg, "base64").subarray(0, 40);
        generate.mockResolvedValue({ data: [{ b64_json: bytes.toString("base64") }] });
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow("invalid or oversized decoded image");
    });

    it("rejects excessive decoded dimensions", async () => {
        const bytes = await sharp({ create: { width: 2049, height: 2048, channels: 3, background: "black" } }).png().toBuffer();
        generate.mockResolvedValue({ data: [{ b64_json: bytes.toString("base64") }] });
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow("invalid or oversized decoded image");
    });

    it("sanitizes provider errors without logging or retrying", async () => {
        const logs = ["log", "warn", "error", "debug", "info"] as const;
        const spies = logs.map(method => vi.spyOn(console, method).mockImplementation(() => {}));
        generate.mockRejectedValue(new Error("secret key, prompt, base64, provider body"));
        await expect(generateStoryBackground("Seoul", "Alleys")).rejects.toThrow(/^GPT Image 2 generation failed\.$/);
        expect(generate).toHaveBeenCalledTimes(1);
        spies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    });

    it("rejects invalid inputs before provider invocation", async () => {
        const calls = [
            () => generateStoryBackground(" ", "Alleys"),
            () => generateStoryBackground("x".repeat(201), "Alleys"),
            () => generateStoryBackground("Seoul", ""),
            () => generateStoryBackground("Seoul", "x".repeat(1001)),
            () => generateStoryBackground("Seoul", "Alleys", "bad" as "vibrant"),
            ...[0, -1, 1.5, 366, NaN].map(day => () => generateDayBackground("Seoul", day, "Alleys", [])),
            () => generateDayBackground("Seoul", 1, "Alleys", Array(51).fill("Walk")),
            () => generateDayBackground("Seoul", 1, "Alleys", [""]),
            () => generateDayBackground("Seoul", 1, "Alleys", ["x".repeat(501)]),
        ];
        for (const call of calls) await expect(call()).rejects.toThrow("GPT Image 2");
        expect(OpenAI).not.toHaveBeenCalled();
        expect(generate).not.toHaveBeenCalled();
    });
});

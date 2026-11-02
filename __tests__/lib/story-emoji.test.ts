import { describe, expect, it } from "vitest";
import { getActivityEmoji, getHighlightEmoji, STORY_EMOJI, STORY_FALLBACK_EMOJI } from "@/lib/story-emoji";
import { STORY_EMOJI_SVG } from "@/lib/story-emoji-svg";

describe("getActivityEmoji", () => {
    it.each([
        // Tokyo 472bf561 day 1: three different topics, not three diamonds
        [{ name: "Kissa Hinoki", localleyScore: 6 }, "☕"],
        [{ name: "Jujo Ginza Shopping Street", localleyScore: 6 }, "🛍️"],
        [{ name: "Akabane Drinking Strip", localleyScore: 5 }, "🍻"],
        [{ name: "Torikizoku Yakitori" }, "🍢"],
        [{ name: "Menya Ramen Counter" }, "🍜"],
        [{ name: "Senso-ji" }, "⛩️"],
        [{ name: "Meiji Jingu Shrine" }, "⛩️"],
        [{ name: "Shinjuku Gyoen Garden" }, "🌳"],
        [{ name: "Mori Art Museum" }, "🖼️"],
        [{ name: "Tokyo Tower" }, "🌆"],
        [{ name: "Haeundae Beach" }, "🏖️"],
        [{ name: { en: "Ikseon-dong Hanok Alley", ko: "익선동" } }, "🏘️"],
    ])("picks the topic for %j", (activity, emoji) => {
        expect(getActivityEmoji(activity)).toBe(emoji);
    });

    it("lets the category win over the name", () => {
        expect(getActivityEmoji({ name: "Blue Bottle", category: "cafe" })).toBe("☕");
        expect(getActivityEmoji({ name: "Shopping Street Stall", category: "bar" })).toBe("🍻");
    });

    it("never returns the score diamond and falls back to a pin", () => {
        expect(getActivityEmoji({ name: "Somewhere Nice", localleyScore: 6 })).toBe(STORY_FALLBACK_EMOJI);
        expect(getActivityEmoji({ name: "" })).toBe("📍");
        expect(getActivityEmoji({})).toBe("📍");
        expect(STORY_EMOJI).not.toContain("💎");
    });

    it("does not match words inside other words", () => {
        expect(getActivityEmoji({ name: "Barcelona Corner" })).toBe("📍");
        expect(getActivityEmoji({ name: "Namsan" })).toBe("📍");
    });
});

describe("getHighlightEmoji", () => {
    it.each([
        ["Late-night grilled chicken in Akabane", "🍢"],
        ["Yakitori under the tracks", "🍢"],
        ["Korean BBQ in Mapo", "🍢"],
        ["Fresh sushi at Tsukiji", "🍣"],
        ["Hand-made dumplings", "🥟"],
        ["Slurping noodles", "🍜"],
        ["Retro pudding at a kissa", "☕"],
        ["Hidden temples", "⛩️"],
        ["Sunset from the tower", "🌆"],
        ["Discover Shitamachi culture", "🏛️"],
        ["Create memories", "✨"],
    ])("%s -> %s", (highlight, emoji) => {
        expect(getHighlightEmoji(highlight)).toBe(emoji);
    });

    it("uses a real emoji, not a bare symbol, when nothing matches", () => {
        expect(getHighlightEmoji("Something else entirely")).toBe("📍");
        expect(getHighlightEmoji("")).toBe("📍");
    });
});

describe("bundled emoji artwork", () => {
    it("has an SVG for every emoji a picker can return", () => {
        for (const emoji of STORY_EMOJI) {
            const src = STORY_EMOJI_SVG[emoji];
            expect(src, emoji).toMatch(/^data:image\/svg\+xml;base64,/);
            expect(Buffer.from(src.split(",")[1], "base64").toString("utf8"), emoji).toContain("<svg");
        }
        expect(STORY_EMOJI_SVG["🗓️"]).toBeDefined();
    });
});

import { describe, expect, it } from "vitest";
import { bannedPhrases, mergeSpotSources, normalizeSourceUrls, parseSpotGuide, publicTips, splitDescriptionLinks } from "@/lib/spots/guide";

const id = "6bff8713-ceaa-45f8-a8b8-3e39d4017b03";
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const guide = (text: string, extra: Record<string, unknown> = {}) => ({ version: 1, spotId: id, updatedAt: "2026-11-01T00:00:00Z", guide: text, ...extra });

describe("spot guide", () => {
  it("accepts 80-200 words and rejects other lengths or another spot", () => {
    expect(parseSpotGuide(guide(words(120), { price: "KRW 20,000 a bowl" }), id)?.price).toBe("KRW 20,000 a bowl");
    expect(parseSpotGuide(guide(words(40)), id)).toBeNull();
    expect(parseSpotGuide(guide(words(260)), id)).toBeNull();
    expect(parseSpotGuide(guide(words(120)), "15614d97-380f-4e8d-8aa6-aa6f43609bcf")).toBeNull();
    expect(parseSpotGuide({ nope: true }, id)).toBeNull();
  });

  it("rejects a guide with internal wording anywhere", () => {
    expect(parseSpotGuide(guide(`${words(100)} image pending`), id)).toBeNull();
    expect(parseSpotGuide(guide(words(100), { tips: ["Kakao opens the route"] }), id)).toBeNull();
    expect(bannedPhrases("Editorial estimate, not visitor count.")).toHaveLength(2);
    expect(bannedPhrases("Order the ginseng chicken soup before noon.")).toEqual([]);
  });

  it("drops pipeline notes from stored tips", () => {
    expect(publicTips([
      "Verify which palace gate or garden area is shown before final submission.",
      "If using this spot, consider noting it as part of Seoul's royal palaces rather than a hidden-local find.",
      "Go at opening time to beat the tour buses.",
    ])).toEqual(["Go at opening time to beat the tour buses."]);
  });

  it("moves description links to sources and dedupes sources", () => {
    const split = splitDescriptionLinks("A quiet tea house. [Visit Seoul](https://korean.visitseoul.net/a) More text.");
    expect(split).toEqual({ text: "A quiet tea house. More text.", links: [{ title: "Visit Seoul", url: "https://korean.visitseoul.net/a" }] });
    const merged = mergeSpotSources(split.links, [{ title: "dup", url: "https://korean.visitseoul.net/a" }],
      normalizeSourceUrls('["https://www.instagram.com/p/1","https://www.instagram.com/p/2","https://www.instagram.com/p/3","javascript:x"]'));
    expect(merged.map((s) => s.url)).toEqual(["https://korean.visitseoul.net/a", "https://www.instagram.com/p/1", "https://www.instagram.com/p/2"]);
    expect(merged[1].title).toBe("instagram.com");
    expect(normalizeSourceUrls(null)).toEqual([]);
  });
});

describe("public UI wording guard (content-first item 5)", () => {
  it("app/ and components/ hold no internal pipeline wording", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { if (name !== "admin" && name !== "api") walk(path); continue; }
        if (!/\.tsx?$/.test(name)) continue;
        const text = readFileSync(path, "utf8");
        for (const phrase of [...bannedPhrases(text), ...(/Photo unavailable/.test(text) ? ["Photo unavailable"] : [])]) hits.push(`${path}: ${phrase}`);
      }
    };
    walk("app");
    walk("components");
    expect(hits).toEqual([]);
  });
});

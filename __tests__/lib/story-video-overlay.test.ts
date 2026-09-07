// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { formatStoryVideoText, renderStoryVideoOverlay, type StoryVideoOverlayInput } from "../../lib/story-video-overlay";

const valid = { title: "Text in the MP4", caption: "Separate overlay\nOffline test only", durationSeconds: 4 };

describe("offline story video overlay", () => {
  it("adds proof labels only in explicit test mode", async () => {
    for (const testMode of [false, true]) {
      const png = await renderStoryVideoOverlay({ ...valid, durationSeconds: 6, testMode });
      const data = await sharp(png).extract({ left: 72, top: 1510, width: 936, height: 80 }).ensureAlpha().raw().toBuffer();
      let visible = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]) visible++;
      expect(visible > 0).toBe(testMode);
    }
  });
  it.each(["", " ", "x".repeat(161), "<b>text</b>", "a\u0000b", "Tokyo 東京", "a\n\nb", null, 123,
    "🙂", "a\tb", "a\rb", "a\u007fb", "a\u0085b", "a\u202eb", "a\u2066b\u2069", "a\u200db", "a\ufe0fb", "a\u3164b", "a\u115fb",
    "<script>alert(1)</script>", "a\ud800b", "café", "ᄀ".repeat(40),
  ])("rejects invalid captions: %s", async caption => {
    expect(() => formatStoryVideoText({ ...valid, caption } as StoryVideoOverlayInput)).toThrow();
    await expect(renderStoryVideoOverlay({ ...valid, caption } as StoryVideoOverlayInput)).rejects.toThrow();
  });
  it.each([0, -1, 3.99, 6.01, Infinity, NaN, "4", null])("rejects invalid durations: %s", async durationSeconds => {
    await expect(renderStoryVideoOverlay({ ...valid, durationSeconds } as StoryVideoOverlayInput)).rejects.toThrow();
  });
  it("rejects oversized titles and unknown fonts", async () => {
    await expect(renderStoryVideoOverlay({ ...valid, title: "x".repeat(201) })).rejects.toThrow();
    await expect(renderStoryVideoOverlay({ ...valid, font: "remote" } as unknown as StoryVideoOverlayInput)).rejects.toThrow();
  });
  it("preserves short text and explicit line breaks", () => {
    expect(formatStoryVideoText(valid)).toEqual({ title: [valid.title], caption: ["Separate overlay", "Offline test only"] });
    expect(formatStoryVideoText({ title: "Seoul\nA local guide", caption: "City: Seoul\nAI-generated travel scene" })).toEqual({
      title: ["Seoul", "A local guide"], caption: ["City: Seoul", "AI-generated travel scene"],
    });
  });
  it("normalizes modern conjoining Jamo and wraps Korean by cells without splitting graphemes", () => {
    const title = "서울 골목 여행";
    expect(formatStoryVideoText({ title: title.normalize("NFD"), caption: "ㄱㄴㄷ ᄀ ᅡ ᆨ" })).toEqual({
      title: [title], caption: ["ㄱㄴㄷ ᄀ ᅡ ᆨ"],
    });
    expect(formatStoryVideoText({ title: "한".repeat(25), caption: "Proof" }).title).toEqual([
      "한".repeat(12), "한".repeat(10) + "...",
    ]);
    expect(() => formatStoryVideoText({ title: "각".repeat(100).normalize("NFD"), caption: "Proof" })).toThrow();
    expect(formatStoryVideoText({ title: "Proof", caption: `${"ᄀ".repeat(19)}AI-generated travel scene${"ᄀ".repeat(19)}\nX\nY` })
      .caption.at(-1)).toBe("AI-generated travel scene");
    const result = formatStoryVideoText({ title: "서울 Seoul 골목 여행 ".repeat(10),
      caption: "성수동에서 만나는 동네 이야기 ".repeat(7) + "AI-generated travel scene" });
    expect(result.caption.at(-1)).toBe("AI-generated travel scene");
    expect(result.title).toHaveLength(2);
    expect(result.caption).toHaveLength(3);
    for (const [lines, width] of [[result.title, 24], [result.caption, 38]] as const) {
      expect(lines.every(line => Array.from(line).reduce((n, char) => n + (char.charCodeAt(0) > 127 ? 2 : 1), 0) <= width)).toBe(true);
    }
  });
  it("pins a static CFF font with real outlines for every accepted visible character", async () => {
    const data = await readFile(new URL("../../lib/fonts/NotoSansKR-Regular.otf", import.meta.url));
    expect(data.length).toBe(4644748);
    expect(createHash("sha256").update(data).digest("hex")).toBe("69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68");
    const tags = Array.from({ length: data.readUInt16BE(4) }, (_, i) => data.toString("ascii", 12 + i * 16, 16 + i * 16));
    expect(tags).toContain("CFF ");
    expect(tags).not.toContain("fvar");
    expect(tags).not.toContain("CFF2");
    // Use Satori's existing parser, not a new root dependency or a system fallback font.
    const require = createRequire(import.meta.url);
    const font = require("@shuding/opentype.js").parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    let accepted = 0;
    for (let cp = 0x21; cp <= 0xffff; cp++) {
      const char = String.fromCodePoint(cp);
      try { formatStoryVideoText({ title: char, caption: "Proof" }); } catch { continue; }
      const glyph = font.charToGlyph(char.normalize("NFC"));
      expect(glyph.index, `U+${cp.toString(16)}`).toBeGreaterThan(0);
      expect(glyph.path.commands.length, `U+${cp.toString(16)} outline`).toBeGreaterThan(0);
      accepted++;
    }
    expect(accepted).toBeGreaterThan(11300);
    // Satori's reduced parser omits names. Read the SFNT name table to verify its notice.
    const nameOffset = data.readUInt32BE(12 + tags.indexOf("name") * 16 + 8);
    const stringOffset = nameOffset + data.readUInt16BE(nameOffset + 4);
    const notices = [];
    for (let i = 0; i < data.readUInt16BE(nameOffset + 2); i++) {
      const record = nameOffset + 6 + i * 12;
      if (data.readUInt16BE(record) !== 3 || data.readUInt16BE(record + 6) !== 0) continue;
      const start = stringOffset + data.readUInt16BE(record + 10);
      notices.push(Buffer.from(data.subarray(start, start + data.readUInt16BE(record + 8))).swap16().toString("utf16le"));
    }
    expect(notices).toEqual(["\u00a9 2014-2021 Adobe (http://www.adobe.com/)."]);
  }, 20_000); // Exhaustive BMP validation and outline parsing can exceed five seconds on shared CI hosts.
  it.each(["서울 골목 여행", "성수동에서 만나는 동네 이야기", "서울 골목 여행".normalize("NFD"), "ㄱㄴㄷ ᄀ ᅡ ᆨ", "Seoul 2026 & Localley", "‘서울’ · “Seoul” — … 「골목」"])(
    "renders real Korean and English outlines offline: %s", async title => {
      const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
      try {
        const options = { title, caption: "성수동에서 만나는 동네 이야기\nAI-generated travel scene", durationSeconds: 4 };
        const png = await renderStoryVideoOverlay(options);
        const pixels = await sharp(png).extract({ left: 72, top: 960, width: 936, height: 400 }).ensureAlpha().raw().toBuffer();
        expect(pixels.filter((value, i) => i % 4 === 3 && value > 0).length).toBeGreaterThan(1000);
        expect(await renderStoryVideoOverlay({ ...options, title: title.normalize("NFC") })).toEqual(png);
        expect(fetch).not.toHaveBeenCalled();
      } finally { fetch.mockRestore(); }
    },
  );
  it("wraps words deterministically and breaks long words", () => {
    expect(formatStoryVideoText({ title: "A quiet weekend exploring Seoul", caption: "x".repeat(39) })).toEqual({
      title: ["A quiet weekend", "exploring Seoul"], caption: ["x".repeat(38), "x"],
    });
    expect(formatStoryVideoText({ title: "x".repeat(49), caption: "Proof" }).title).toEqual(["x".repeat(24), "x".repeat(21) + "..."]);
  });
  it.each(["start", "middle", "end"])("preserves disclosure at the %s of a maximum caption", position => {
    const disclosure = "AI-generated travel scene";
    const city = "W".repeat(160 - disclosure.length - 1);
    const caption = position === "start" ? `${disclosure}\n${city}` : position === "end" ? `${city}\n${disclosure}` :
      `${city.slice(0, 60)} ${disclosure}${city.slice(60)}`;
    expect(caption).toHaveLength(160);
    const result = formatStoryVideoText({ title: "W".repeat(200), caption });
    expect(result.title).toEqual(["W".repeat(24), "W".repeat(21) + "..."]);
    expect(result.caption).toHaveLength(3);
    expect(result.caption[1]).toMatch(/\.\.\.$/);
    expect(result.caption[2]).toBe(disclosure);
    expect(result.caption.every(line => line.length <= 38)).toBe(true);
  });
  it("fits maximum generic captions and excessive explicit lines with visible ellipsis", () => {
    expect(formatStoryVideoText({ title: "Short", caption: "x".repeat(160) }).caption).toEqual([
      "x".repeat(38), "x".repeat(38), "x".repeat(35) + "...",
    ]);
    expect(formatStoryVideoText({ title: "a\nb\nc", caption: "a\nb\nc\nd" })).toEqual({
      title: ["a", "b..."], caption: ["a", "b", "c..."],
    });
  });
  it("renders transparent full-size PNG without mutating model media", async () => {
    const modelMedia = Object.freeze({ url: "https://example.invalid/original.mp4", provider: "untouched" });
    const input = Object.freeze({ ...valid, modelMedia });
    const before = JSON.stringify(input);
    const png = await renderStoryVideoOverlay(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(input.modelMedia).toBe(modelMedia);
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([1080, 1920, 4]);
    let visible = 0;
    let safeZonePixels = 0;
    for (let y = 0; y < 1920; y++) {
      for (let x = 0; x < 1080; x++) {
        const alpha = data[(y * 1080 + x) * 4 + 3];
        if ((y < 180 || y >= 1600) && alpha) safeZonePixels++;
        if (alpha) visible++;
      }
    }
    expect(visible).toBeGreaterThan(1000);
    expect(safeZonePixels).toBe(0);
    expect(visible).toBeLessThan(1080 * 1920 / 4);
  });
  it.each([
    { title: "W".repeat(200), caption: "W".repeat(134) + "\nAI-generated travel scene" },
    { title: "W".repeat(200), caption: "W".repeat(160) },
    { title: `${"W".repeat(24)}\n${"W".repeat(24)}`, caption: Array(3).fill("W".repeat(38)).join("\n") },
    { title: "서울 Seoul 골목 여행 ".repeat(10), caption: "성수동에서 만나는 동네 이야기 ".repeat(7) + "AI-generated travel scene" },
    { title: "한".repeat(200), caption: "한".repeat(160) },
  ])("keeps maximum text within safe bounds without fetching: %j", async text => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
    try {
      const png = await renderStoryVideoOverlay({
        ...text,
        durationSeconds: 6,
        font: "noto-sans-kr",
      });
      const data = await sharp(png).ensureAlpha().raw().toBuffer();
      let outside = 0;
      for (let y = 0; y < 1920; y++) for (let x = 0; x < 1080; x++) {
        if ((x < 72 || x >= 1008 || y < 180 || y >= 1600) && data[(y * 1080 + x) * 4 + 3]) outside++;
      }
      expect(outside).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});

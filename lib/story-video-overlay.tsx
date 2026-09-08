import React from "react";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ImageResponse } from "@vercel/og";

export type StoryVideoOverlayInput = Readonly<{
  title: string;
  caption: string;
  durationSeconds: number;
  font?: "noto-sans-kr";
  testMode?: boolean;
}>;

const segments = new Intl.Segmenter("ko", { granularity: "grapheme" });
const cells = (text: string) => Array.from(text).reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 2 : 1), 0);
const takeCells = (text: string, width: number) => {
  let result = "";
  let used = 0;
  for (const { segment } of segments.segment(text)) {
    used += cells(segment);
    if (used > width) break;
    result += segment;
  }
  return result;
};
let fontData: Promise<Buffer> | undefined;

/** Synchronous pre-provider contract. Keep the original UTF-16 storage bounds.
 * Accept NFC Hangul, modern conjoining/compatibility Jamo, ASCII and listed punctuation only.
 * The pinned font's cmap and visible outlines are exhaustively checked in tests.
 */
export function formatStoryVideoText(input: Pick<StoryVideoOverlayInput, "title" | "caption">) {
  const fit = (value: unknown, name: string, limit: number, count: number, width: number): string[] => {
    if (typeof value !== "string" || !value.trim() || value.length > limit) {
      throw new Error(`${name} must be bounded Korean or English plain text`);
    }
    const normalized = value.normalize("NFC");
    if (!/^[\x20-\x7e\n\uac00-\ud7a3\u1100-\u1112\u1161-\u1175\u11a8-\u11c2\u3131-\u3163\u00b7\u2013-\u2014\u2018-\u2019\u201c-\u201d\u2026\u3001-\u3002\u3008-\u300f]+$/.test(normalized) ||
        /[<>]/.test(normalized) || normalized.split("\n").some(line => !line.trim()) ||
        Array.from(segments.segment(normalized)).some(({ segment }) => cells(segment) > width)) {
      throw new Error(`${name} contains unsupported characters; use Korean or English plain text`);
    }
    const wrap = (text: string) => text.split("\n").filter(line => line.trim()).flatMap(paragraph => {
      const lines: string[] = [];
      let rest = paragraph.trim();
      while (cells(rest) > width) {
        const prefix = takeCells(rest, width);
        const space = rest.lastIndexOf(" ", prefix.length);
        const end = space > 0 ? space : prefix.length;
        lines.push(rest.slice(0, end).trimEnd());
        rest = rest.slice(end).trimStart();
      }
      if (rest) lines.push(rest);
      return lines;
    });
    const abridge = (lines: string[], capacity: number) => {
      if (lines.length <= capacity) return lines;
      const result = lines.slice(0, capacity);
      result[capacity - 1] = takeCells(result[capacity - 1], width - 3).trimEnd() + "...";
      return result;
    };
    const lines = wrap(normalized);
    const disclosure = "AI-generated travel scene";
    if (name === "caption" && lines.length > count && normalized.includes(disclosure)) {
      // Reserve a separate line before abridging city or other descriptive text.
      return [...abridge(wrap(normalized.replace(disclosure, " ").trim()), count - 1), disclosure];
    }
    return abridge(lines, count);
  };
  return {
    title: fit(input.title, "title", 200, 2, 24),
    caption: fit(input.caption, "caption", 160, 3, 38),
  };
}

/** No media input, HTML, remote fonts, generation, credits, or encoder route.
 * Local Noto Sans KR Regular covers both languages. Retain lib/fonts/OFL.txt and notices.
 */
export async function renderStoryVideoOverlay(input: StoryVideoOverlayInput): Promise<Uint8Array> {
  if (!input || typeof input !== "object" ||
      !Number.isFinite(input.durationSeconds) || input.durationSeconds < 4 || input.durationSeconds > 6) {
    throw new Error("durationSeconds must be finite and between 4 and 6");
  }
  if (input.font !== undefined && input.font !== "noto-sans-kr") {
    throw new Error("Only local noto-sans-kr is supported");
  }
  const { title, caption } = formatStoryVideoText(input);
  const font = await (fontData ??= readFile(new URL("./fonts/NotoSansKR-Regular.otf", import.meta.url)).then(data => {
    if (createHash("sha256").update(data).digest("hex") !== "69975a0ac8472717870aefeab0a4d52739308d90856b9955313b2ad5e0148d68") {
      throw new Error("Story font integrity check failed");
    }
    return data;
  }));
  const response = new ImageResponse(
    <div style={{ display: "flex", width: 1080, height: 1920, position: "relative", color: "white", fontFamily: "Noto", fontWeight: 400 }}>
      {input.testMode === true && <div style={{ display: "flex", position: "absolute", top: 200, left: 72, fontSize: 32 }}>Localley export test</div>}
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 960, left: 72, width: 936 }}>
        {title.map((line, i) => <div key={i} style={{ display: "flex", whiteSpace: "pre", fontSize: Math.min(56, 936 / (cells(line) * 1.1)), lineHeight: 1.25 }}>{line}</div>)}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 40 }}>
          {caption.map((line, i) => <div key={i} style={{ display: "flex", whiteSpace: "pre", fontSize: Math.min(36, 936 / (cells(line) * 1.1)), lineHeight: 1.4 }}>{line}</div>)}
        </div>
      </div>
      {input.testMode === true && <div style={{ display: "flex", position: "absolute", top: 1510, left: 72, fontSize: 26 }}>TEST / SYNTHETIC INPUT / NO REAL FOOTAGE</div>}
    </div>,
    { width: 1080, height: 1920, fonts: [{ name: "Noto", data: font, weight: 400, style: "normal" }] },
  );
  // ImageResponse is lazy; consume it here so rendering failures reject this call.
  return new Uint8Array(await response.arrayBuffer());
}

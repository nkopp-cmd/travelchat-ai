import { z } from "zod";

/**
 * Spot guidance written from verified facts (scripts/spot-guides.mjs, subscription only) and kept in R2
 * (COMMUNITY_MEDIA) as guides/spots/<id>.json. The page shows it first; a missing guide falls back to the
 * stored description. shared/plans/content-first.md item 1.
 */
export const SPOT_GUIDE_PREFIX = "guides/spots/";
export const GUIDE_MIN_WORDS = 80;
export const GUIDE_MAX_WORDS = 200;

const line = z.string().trim().min(2).max(160);
const source = z.object({ title: z.string().trim().min(1).max(160), url: z.string().url().refine((url) => /^https?:\/\//.test(url)) });

export const spotGuideSchema = z.object({
  version: z.literal(1),
  spotId: z.uuid(),
  updatedAt: z.string(),
  guide: z.string().trim().min(1).max(1600),
  orderOrDo: z.array(line).max(4).default([]),
  bestTime: line.nullable().default(null),
  price: line.nullable().default(null),
  duration: line.nullable().default(null),
  tips: z.array(line).max(4).default([]),
  sources: z.array(source).max(8).default([]),
});

export type SpotGuide = z.infer<typeof spotGuideSchema>;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Phrases that describe our pipeline instead of the place. They never reach a public page
 * (content-first rule 2); the generator rejects a guide that contains one.
 */
export const BANNED_PUBLIC_PHRASES = [
  /stored photo reference/i,
  /image pending/i,
  /editorial estimate/i,
  /not visitor count/i,
  /route-ready/i,
  /kakao opens/i,
  /maps opens/i,
  /not independently verified/i,
  /no stock substitute/i,
  /verified by/i,
  /source record/i,
  /\bno guess/i,
  /confirm hours with the venue/i,
  /visit advice, not opening hours/i,
  /before final submission/i,
  /\bif using this spot\b/i,
  /\bconsider noting\b/i,
  /\bfeatured in the post\b/i,
  /\bshown in the post\b/i,
  /\bverify which\b/i,
  /\bhidden-local find\b/i,
];

/** Stored tips that read as pipeline notes are dropped from the page. */
export function publicTips(tips: string[]): string[] {
  return tips.filter((tip) => tip.trim().length > 1 && bannedPhrases(tip).length === 0);
}

export function bannedPhrases(text: string): string[] {
  return BANNED_PUBLIC_PHRASES.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

/** Guide accepted for display: right length, no internal wording. */
export function parseSpotGuide(value: unknown, spotId: string): SpotGuide | null {
  const parsed = spotGuideSchema.safeParse(value);
  if (!parsed.success || parsed.data.spotId !== spotId) return null;
  const words = countWords(parsed.data.guide);
  if (words < GUIDE_MIN_WORDS || words > GUIDE_MAX_WORDS) return null;
  const all = [parsed.data.guide, ...parsed.data.orderOrDo, ...parsed.data.tips, parsed.data.bestTime ?? "", parsed.data.price ?? "", parsed.data.duration ?? ""].join("\n");
  if (bannedPhrases(all).length) return null;
  return parsed.data;
}

/** Markdown links in imported descriptions ("[Venue guide](url)") move to the page-end sources list. */
export function splitDescriptionLinks(description: string): { text: string; links: { title: string; url: string }[] } {
  const links: { title: string; url: string }[] = [];
  const text = description
    .replace(/\[([^\]]{1,120})\]\((https?:\/\/[^\s)]+)\)/g, (_match, title: string, url: string) => {
      links.push({ title: title.trim(), url });
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text, links };
}

/** Sources for the page end: guide sources, description links, stored source_urls; one entry per URL. */
export function mergeSpotSources(...groups: { title: string; url: string }[][]): { title: string; url: string }[] {
  const seen = new Set<string>();
  const perHost = new Map<string, number>();
  const out: { title: string; url: string }[] = [];
  for (const item of groups.flat()) {
    if (!/^https?:\/\//.test(item.url) || seen.has(item.url)) continue;
    const host = sourceTitleFromUrl(item.url);
    if ((perHost.get(host) ?? 0) >= 2) continue;
    perHost.set(host, (perHost.get(host) ?? 0) + 1);
    seen.add(item.url);
    out.push(item);
    if (out.length >= 8) break;
  }
  return out;
}

export function sourceTitleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

/** source_urls column: JSON array of strings or objects with url, or null. */
export function normalizeSourceUrls(value: unknown): { title: string; url: string }[] {
  let raw = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const url = typeof item === "string" ? item : item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string" ? (item as { url: string }).url : null;
    if (!url || !/^https?:\/\//.test(url)) return [];
    const title = item && typeof item === "object" && typeof (item as { title?: unknown }).title === "string" ? (item as { title: string }).title.slice(0, 160) : sourceTitleFromUrl(url);
    return [{ title, url }];
  });
}

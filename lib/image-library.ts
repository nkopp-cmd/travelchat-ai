import library from "./image-library.json";
import { ALL_CITIES } from "./cities";

/**
 * Pre-generated image library (reach-engine-20261114 R8, weekend-sprint L5): story backgrounds per city x mood and
 * activity thumbnails per city x category, made on the ChatGPT plan (scripts/image-library/) and stored in R2:
 * story -> legacy/<sha256>.jpg (read by the story renderer as /media/story/<sha256>.jpg, JPEG because Satori has no
 * WebP); activity -> activity-thumbnails/<hex>.webp (served by /media/activity/). The routes serve ONLY library
 * images: no paid image API is ever called (Nils 2026-11-14, APPROVALS.md). A miss falls back to the nearest
 * library image (same mood in another city, then another mood), never to generation.
 *
 * Every library image is a painted illustration of a city mood or a category (a cafe, a market), never of a named
 * place: a generated image must never pass as a photo of a real spot. That is why activity thumbnails are keyed by
 * category, not by venue name.
 */
export const STORY_MOODS = ["skyline", "street", "night", "food", "nature", "cafe"] as const;
export type StoryMood = (typeof STORY_MOODS)[number];

export const ACTIVITY_CATEGORIES = [
  "restaurant", "cafe", "bar", "market", "temple", "park", "museum", "shopping", "attraction", "neighborhood",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Key for the city-independent activity thumbnails. */
export const ANY_CITY = "_";

type Library = {
  /** false = the set is off live (Nils 2026-11-14: painted style does not match the app). Lookups return null, the
   * media routes refuse its files, and saved slides render the branded gradient. Set true to switch it back on. */
  live?: boolean;
  story: Record<string, Partial<Record<StoryMood, string>>>;
  activity: Record<string, Partial<Record<ActivityCategory, string>>>;
};

const STORY_PATH = /^\/media\/story\/[0-9a-f]{64}\.jpg$/;

/** True when the shipped library is switched on (lib/image-library.json "live"). */
export const LIBRARY_LIVE = (library as Library).live !== false;

const LIBRARY_PATHS = new Set<string>([
  ...Object.values((library as Library).story).flatMap((m) => Object.values(m ?? {})),
  ...Object.values((library as Library).activity).flatMap((m) => Object.values(m ?? {})),
].filter((p): p is string => typeof p === "string"));

/** A /media/story or /media/activity path from the library while the library is off live: serve nothing for it. */
export function isRetiredLibraryPath(path: string | null | undefined, live: boolean = LIBRARY_LIVE): boolean {
  return !live && !!path && LIBRARY_PATHS.has(path.split("?")[0]);
}
const ACTIVITY_PATH = /^\/media\/activity\/[0-9a-f]{1,8}\.webp$/;

/** "Seoul", "seoul", "Seoul, South Korea", "Ho Chi Minh City", "hong-kong" -> the lib/cities.ts slug, else null. */
export function librarySlug(city: string | null | undefined): string | null {
  const raw = (city ?? "").trim().toLowerCase();
  if (!raw) return null;
  const candidates = [raw, raw.split(",")[0].trim()];
  for (const value of candidates) {
    const dashed = value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const hit = ALL_CITIES.find((c) => c.slug === dashed || c.name.toLowerCase() === value);
    if (hit) return hit.slug;
  }
  return null;
}

/** Day slides render in parallel (each only excludes the cover), so each day number owns one mood: no two days match. */
const DAY_MOODS: StoryMood[] = ["street", "food", "night", "cafe"];

/** The exact library mood for a slide, or null when the slide has none (day 5+: see nearestLibraryStoryBackground). */
export function slideMood(type: string | undefined, dayNumber: number | undefined): StoryMood | null {
  if (type === "cover") return "skyline";
  if (type === "summary") return "nature";
  if (type === "day" && Number.isInteger(dayNumber) && (dayNumber as number) >= 1) return DAY_MOODS[(dayNumber as number) - 1] ?? null;
  return null;
}

/**
 * The library story background for this slide when it is not in `exclude` (the other slides' images), or null.
 * The caller then uses nearestLibraryStoryBackground.
 */
export function libraryStoryBackground(
  city: string | null | undefined,
  type: string | undefined,
  dayNumber: number | undefined,
  exclude: readonly string[] = [],
  source: Library = library as Library,
): string | null {
  if (source.live === false) return null;
  const slug = librarySlug(city);
  const mood = slideMood(type, dayNumber);
  const path = slug && mood ? source.story[slug]?.[mood] : undefined;
  return path && STORY_PATH.test(path) && !exclude.includes(path) ? path : null;
}

function cityHash(value: string): number {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * The nearest library story background for any slide, or null only when every candidate is excluded.
 * Order: the city's own mood; the same mood in a same-country city; the same mood anywhere; then other moods.
 * Day 5+ cycles DAY_MOODS and shifts one city further per cycle, so parallel day slides stay unique.
 * An unknown city starts from a fixed city chosen by a hash of its name (same trip -> same images).
 */
export function nearestLibraryStoryBackground(
  city: string | null | undefined,
  type: string | undefined,
  dayNumber: number | undefined,
  exclude: readonly string[] = [],
  source: Library = library as Library,
): string | null {
  if (source.live === false) return null;
  const day = type === "day" && Number.isInteger(dayNumber) && (dayNumber as number) >= 1 ? (dayNumber as number) : null;
  const mood: StoryMood = type === "cover" ? "skyline" : type === "summary" ? "nature" : day ? DAY_MOODS[(day - 1) % DAY_MOODS.length] : "street";
  const shift = day ? Math.floor((day - 1) / DAY_MOODS.length) : 0;
  const slugs = Object.keys(source.story).sort();
  if (slugs.length === 0) return null;
  const own = librarySlug(city);
  const home = own && source.story[own] ? own : slugs[cityHash((city ?? "").trim().toLowerCase()) % slugs.length];
  const country = ALL_CITIES.find((c) => c.slug === home)?.countryCode;
  const sameCountry = slugs.filter((s) => s !== home && ALL_CITIES.find((c) => c.slug === s)?.countryCode === country);
  const others = slugs.filter((s) => s !== home && !sameCountry.includes(s));
  const order = [home, ...sameCountry, ...others];
  const cities = [...order.slice(shift % order.length), ...order.slice(0, shift % order.length)];
  const moods = [mood, ...STORY_MOODS.filter((m) => m !== mood)];
  for (const m of moods) {
    for (const slug of cities) {
      const path = source.story[slug]?.[m];
      if (path && STORY_PATH.test(path) && !exclude.includes(path)) return path;
    }
  }
  return null;
}

/** Category words used by the itinerary generators -> one library category. */
export function libraryCategory(category: string | null | undefined): ActivityCategory {
  const value = (category ?? "").toLowerCase();
  const direct = ACTIVITY_CATEGORIES.find((c) => c === value);
  if (direct) return direct;
  if (/market/.test(value)) return "market";
  if (/food|dining|eat|restaurant|street food/.test(value)) return "restaurant";
  if (/coffee|cafe|dessert|bakery|tea/.test(value)) return "cafe";
  if (/night|bar|pub|club|drink/.test(value)) return "bar";
  if (/temple|shrine|church|religio|palace|heritage|historic/.test(value)) return "temple";
  if (/park|nature|garden|outdoor|hike|beach|mountain|river/.test(value)) return "park";
  if (/museum|gallery|art|culture/.test(value)) return "museum";
  if (/shop|mall|boutique|retail/.test(value)) return "shopping";
  if (/neighbo|street|district|area|walk/.test(value)) return "neighborhood";
  return "attraction";
}

/** Library thumbnail for an activity's category: the city's own set first, then the city-independent set. */
export function libraryActivityThumbnail(
  category: string | null | undefined,
  city: string | null | undefined,
  source: Library = library as Library,
): string | null {
  if (source.live === false) return null;
  const key = libraryCategory(category);
  const slug = librarySlug(city);
  for (const set of [slug ? source.activity[slug] : undefined, source.activity[ANY_CITY]]) {
    const path = set?.[key];
    if (path && ACTIVITY_PATH.test(path)) return path;
  }
  return null;
}

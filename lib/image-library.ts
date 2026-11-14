import library from "./image-library.json";
import { ALL_CITIES } from "./cities";

/**
 * Pre-generated image library (reach-engine-20261114 R8, weekend-sprint L5): story backgrounds per city x theme x
 * light and activity thumbnails per city x category, made on the ChatGPT plan (scripts/image-library/) and stored in
 * R2: story -> legacy/<sha256>.jpg (read by the story renderer as /media/story/<sha256>.jpg, JPEG because Satori has
 * no WebP); activity -> activity-thumbnails/<hex>.webp (served by /media/activity/). The routes serve ONLY library
 * images: no paid image API and no live generation per request (Nils 2026-11-14, APPROVALS.md).
 *
 * Story images fit each day of the picked trip (Nils 2026-11-14 CHANGE): pickTripBackgrounds reads every day's
 * spots -> dominant theme (cafe, food/market, nature/park, culture, nightlife, shopping, neighborhood walk) and light
 * (most spots before 17:00 = day, else night). Cover = trip top theme, summary = second theme. No image repeats
 * inside one trip: next-best theme, then the other light, then a same-country city, then any city.
 *
 * Every library image shows a generic city scene or category (a cafe, a market), never a named place: a generated
 * image must never pass as a photo of a real spot.
 */
export const STORY_THEMES = ["cafe", "food", "nature", "culture", "nightlife", "shopping", "neighborhood"] as const;
export type StoryTheme = (typeof STORY_THEMES)[number];
export const STORY_LIGHTS = ["day", "night"] as const;
export type StoryLight = (typeof STORY_LIGHTS)[number];
export type StoryKey = `${StoryTheme}-${StoryLight}`;
export const storyKey = (theme: StoryTheme, light: StoryLight): StoryKey => `${theme}-${light}`;

export const ACTIVITY_CATEGORIES = [
  "restaurant", "cafe", "bar", "market", "temple", "park", "museum", "shopping", "attraction", "neighborhood",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

/** Key for the city-independent activity thumbnails. */
export const ANY_CITY = "_";

export type Library = {
  /** false = the set is off live. Lookups return null, the media routes refuse its files, and saved slides render
   * the branded gradient. */
  live?: boolean;
  story: Record<string, Partial<Record<string, string>>>;
  activity: Record<string, Partial<Record<ActivityCategory, string>>>;
  /** Paths of replaced sets (the painted set, Nils 2026-11-14): always refused, also while live. */
  retired?: string[];
};

const STORY_PATH = /^\/media\/story\/[0-9a-f]{64}\.jpg$/;

/** True when the shipped library is switched on (lib/image-library.json "live"). */
export const LIBRARY_LIVE = (library as Library).live !== false;

const LIBRARY_PATHS = new Set<string>([
  ...Object.values((library as Library).story).flatMap((m) => Object.values(m ?? {})),
  ...Object.values((library as Library).activity).flatMap((m) => Object.values(m ?? {})),
].filter((p): p is string => typeof p === "string"));
const RETIRED_PATHS = new Set<string>((library as Library).retired ?? []);

/** A library path that must serve nothing: a replaced set, or any library path while the library is off live. */
export function isRetiredLibraryPath(path: string | null | undefined, live: boolean = LIBRARY_LIVE): boolean {
  if (!path) return false;
  const clean = path.split("?")[0];
  return RETIRED_PATHS.has(clean) || (!live && LIBRARY_PATHS.has(clean));
}
const ACTIVITY_PATH = /^\/media\/activity\/[0-9a-f]{1,8}\.webp$/;

/** "Seoul", "seoul", "Seoul, South Korea", "Ho Chi Minh City", "hong-kong" -> the lib/cities.ts slug, else null. */
export function librarySlug(city: string | null | undefined): string | null {
  const raw = (city ?? "").trim().toLowerCase();
  if (!raw) return null;
  const candidates = [raw, raw.split(",")[0].trim()];
  for (const value of candidates) {
    const dashed = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const hit = ALL_CITIES.find((c) => c.slug === dashed || c.name.toLowerCase() === value);
    if (hit) return hit.slug;
  }
  return null;
}

function cityHash(value: string): number {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** One spot of a day, as the itinerary generators store it (only these fields are read; never the venue name). */
export interface PickerActivity { category?: unknown; time?: unknown; type?: unknown }
export interface PickerDay { activities?: PickerActivity[] | null }

/** Activity category -> story theme with a weight (a generic "attraction" counts half for culture). */
export function storyThemeOf(category: unknown): { theme: StoryTheme; weight: number } {
  const c = libraryCategory(typeof category === "string" ? category : "");
  switch (c) {
    case "restaurant": case "market": return { theme: "food", weight: 1 };
    case "cafe": return { theme: "cafe", weight: 1 };
    case "bar": return { theme: "nightlife", weight: 1 };
    case "temple": case "museum": return { theme: "culture", weight: 1 };
    case "park": return { theme: "nature", weight: 1 };
    case "shopping": return { theme: "shopping", weight: 1 };
    case "neighborhood": return { theme: "neighborhood", weight: 1 };
    default: return { theme: "culture", weight: 0.5 };
  }
}

/** "09:30", "9 AM", "7:15 pm", "19h" -> hour 0-23; else the morning/afternoon/evening slot; else null. */
export function activityHour(time: unknown, type?: unknown): number | null {
  const m = typeof time === "string" ? time.trim().match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i) : null;
  if (m) {
    let h = Number(m[1]);
    const ap = m[3]?.toLowerCase().replace(/\./g, "");
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return h;
  }
  const slot = typeof type === "string" ? type.toLowerCase() : typeof time === "string" ? time.toLowerCase() : "";
  if (/evening|night/.test(slot)) return 19;
  if (/afternoon/.test(slot)) return 14;
  if (/morning/.test(slot)) return 9;
  return null;
}

/** Most timed spots before 17:00 = day (golden); otherwise night. No times at all = day. */
export function lightOf(activities: readonly PickerActivity[]): StoryLight {
  const hours = activities.map((a) => activityHour(a.time, a.type)).filter((h): h is number => h !== null);
  if (hours.length === 0) return "day";
  return hours.filter((h) => h < 17).length > hours.length / 2 ? "day" : "night";
}

/** Fallback theme order for slides without (enough) categories. */
const DEFAULT_THEMES: StoryTheme[] = ["neighborhood", "culture", "food", "nature", "cafe", "shopping", "nightlife"];

/** All 7 themes, best first: by weighted spot count, ties by DEFAULT_THEMES; themes without spots follow. */
export function rankThemes(activities: readonly PickerActivity[]): StoryTheme[] {
  const score = new Map<StoryTheme, number>();
  for (const a of activities) {
    const { theme, weight } = storyThemeOf(a.category);
    score.set(theme, (score.get(theme) ?? 0) + weight);
  }
  return [...DEFAULT_THEMES].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || DEFAULT_THEMES.indexOf(a) - DEFAULT_THEMES.indexOf(b));
}

export interface TripBackgrounds { cover: string | null; days: Array<string | null>; summary: string | null }

/**
 * Library background for every slide of one trip, with no image used twice. Pure and deterministic: the same trip
 * gives the same images, so slides that ask in parallel still agree. `exclude` = paths that must not be used.
 */
export function pickTripBackgrounds(
  city: string | null | undefined,
  days: readonly (PickerDay | null | undefined)[],
  exclude: readonly string[] = [],
  source: Library = library as Library,
): TripBackgrounds {
  const empty: TripBackgrounds = { cover: null, days: days.map(() => null), summary: null };
  if (source.live === false) return empty;
  const slugs = Object.keys(source.story).sort();
  if (slugs.length === 0) return empty;
  const own = librarySlug(city);
  const home = own && source.story[own] ? own : slugs[cityHash((city ?? "").trim().toLowerCase()) % slugs.length];
  const country = ALL_CITIES.find((c) => c.slug === home)?.countryCode;
  const sameCountry = slugs.filter((s) => s !== home && ALL_CITIES.find((c) => c.slug === s)?.countryCode === country);
  const cities = [home, ...sameCountry, ...slugs.filter((s) => s !== home && !sameCountry.includes(s))];
  const retired = new Set(source.retired ?? []);
  const used = new Set(exclude);

  const pick = (themes: StoryTheme[], light: StoryLight): string | null => {
    const other: StoryLight = light === "day" ? "night" : "day";
    for (const slug of cities) {
      for (const l of [light, other]) {
        for (const t of themes) {
          const path = source.story[slug]?.[storyKey(t, l)];
          if (path && STORY_PATH.test(path) && !used.has(path) && !retired.has(path)) {
            used.add(path);
            return path;
          }
        }
      }
    }
    return null;
  };

  const perDay = days.map((d) => (Array.isArray(d?.activities) ? d.activities : []));
  const all = perDay.flat();
  const tripThemes = rankThemes(all);
  const tripLight = lightOf(all);
  const cover = pick(tripThemes, tripLight);
  const dayImages = perDay.map((acts) => pick(rankThemes(acts), lightOf(acts)));
  const summary = pick([...tripThemes.slice(1), tripThemes[0]], tripLight);
  return { cover, days: dayImages, summary };
}

/** Untrusted request JSON -> at most 31 days x 32 spots of short category/time/type strings, else null. */
export function sanitizePickerDays(value: unknown): PickerDay[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 31) return null;
  const str = (x: unknown) => (typeof x === "string" && x.length <= 100 ? x : undefined);
  const out: PickerDay[] = [];
  for (const d of value) {
    const acts = d && typeof d === "object" && !Array.isArray(d) ? (d as PickerDay).activities : undefined;
    if (acts !== undefined && acts !== null && (!Array.isArray(acts) || acts.length > 32)) return null;
    out.push({ activities: (acts ?? []).map((a) => (a && typeof a === "object" ? { category: str(a.category), time: str(a.time), type: str(a.type) } : {})) });
  }
  return out;
}

/**
 * One slide's background from the trip picker. `days` = the whole trip (every slide request sends the same list, so
 * parallel requests stay distinct). Without `days` (older clients) the slide still gets a library image, and the
 * caller's exclude list keeps it apart from the slides already made.
 */
export function libraryStoryBackgroundForSlide(
  city: string | null | undefined,
  type: string | undefined,
  dayNumber: number | undefined,
  days: readonly (PickerDay | null | undefined)[] | null | undefined,
  exclude: readonly string[] = [],
  source: Library = library as Library,
): string | null {
  const day = type === "day" && Number.isInteger(dayNumber) && (dayNumber as number) >= 1 ? (dayNumber as number) : null;
  if (type === "day" && !day) return null;
  if (Array.isArray(days) && days.length > 0) {
    const trip = [...days];
    while (day && trip.length < day) trip.push({ activities: [] });
    const picked = pickTripBackgrounds(city, trip, [], source);
    const path = type === "cover" ? picked.cover : type === "summary" ? picked.summary : picked.days[(day as number) - 1];
    if (path && !exclude.includes(path)) return path;
    // A client exclude list that disagrees with the picker: keep the slide unique anyway.
  }
  const trip: PickerDay[] = Array.from({ length: day ?? 1 }, () => ({ activities: [] }));
  const picked = pickTripBackgrounds(city, trip, exclude, source);
  return type === "cover" ? picked.cover : type === "summary" ? picked.summary : picked.days[(day as number) - 1] ?? null;
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

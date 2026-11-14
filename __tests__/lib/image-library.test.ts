import { describe, expect, it } from "vitest";
import {
  activityHour, ANY_CITY, isRetiredLibraryPath, LIBRARY_LIVE, libraryActivityThumbnail, libraryCategory, librarySlug,
  libraryStoryBackgroundForSlide, lightOf, pickTripBackgrounds, rankThemes, sanitizePickerDays, STORY_LIGHTS, STORY_THEMES,
  storyKey, storyThemeOf, type Library, type PickerDay,
} from "@/lib/image-library";
import manifest from "@/lib/image-library.json";

// A full fake library: every theme x light for Seoul, Busan (same country) and Tokyo; each path names its slot.
let n = 0;
const paths = new Map<string, string>();
const fakePath = (slot: string) => {
  const p = `/media/story/${(n++).toString(16).padStart(64, "0")}.jpg`;
  paths.set(p, slot);
  return p;
};
const citySet = (city: string) => Object.fromEntries(
  STORY_THEMES.flatMap((t) => STORY_LIGHTS.map((l) => [storyKey(t, l), fakePath(`${city}:${storyKey(t, l)}`)])),
);
const lib: Library = {
  live: true,
  story: { seoul: citySet("seoul"), busan: citySet("busan"), tokyo: citySet("tokyo") },
  activity: { seoul: { cafe: "/media/activity/0000beef.webp" }, [ANY_CITY]: { cafe: "/media/activity/00000caf.webp", attraction: "/media/activity/0000a77a.webp" } },
};
const slot = (p: string | null) => (p ? paths.get(p) : null);
const spot = (category: string, time: string) => ({ category, time });

const cafeDay: PickerDay = { activities: [spot("Cafe", "09:00"), spot("Dessert cafe", "11:00"), spot("Museum", "14:00")] };
const foodNight: PickerDay = { activities: [spot("Street food", "18:00"), spot("Night market", "20:00"), spot("Restaurant", "21:30"), spot("Temple", "10:00")] };
const templeDay: PickerDay = { activities: [spot("Temple", "9:00 AM"), spot("Palace", "11:00 AM"), spot("Museum", "2:00 PM")] };
const barNight: PickerDay = { activities: [spot("Cocktail bar", "21:00"), spot("Pub", "23:00"), spot("Restaurant", "19:00")] };
const parkDay: PickerDay = { activities: [spot("Park", "08:00"), spot("Hiking", "10:00"), spot("Cafe", "15:00")] };
const shopDay: PickerDay = { activities: [spot("Shopping", "13:00"), spot("Boutique", "15:00"), spot("Mall", "16:00")] };
const walkDay: PickerDay = { activities: [spot("Neighborhood", "10:00"), spot("Street walk", "12:00")] };

const all = (t: { cover: string | null; days: Array<string | null>; summary: string | null }) => [t.cover, ...t.days, t.summary];

describe("story day picker (Nils 2026-11-14 CHANGE)", () => {
  it("maps spot categories to the 7 themes", () => {
    expect(storyThemeOf("Coffee & dessert").theme).toBe("cafe");
    expect(storyThemeOf("Night market").theme).toBe("food");
    expect(storyThemeOf("Street food").theme).toBe("food");
    expect(storyThemeOf("Park").theme).toBe("nature");
    expect(storyThemeOf("Temple").theme).toBe("culture");
    expect(storyThemeOf("Museum").theme).toBe("culture");
    expect(storyThemeOf("Cocktail bar").theme).toBe("nightlife");
    expect(storyThemeOf("Boutique").theme).toBe("shopping");
    expect(storyThemeOf("Neighborhood walk").theme).toBe("neighborhood");
    expect(storyThemeOf(undefined)).toEqual({ theme: "culture", weight: 0.5 });
  });

  it("reads time of day: most spots before 17:00 = day, else night", () => {
    expect(activityHour("09:30")).toBe(9);
    expect(activityHour("7:15 PM")).toBe(19);
    expect(activityHour("12:00 AM")).toBe(0);
    expect(activityHour("", "evening")).toBe(19);
    expect(activityHour(undefined, "morning")).toBe(9);
    expect(activityHour("whenever")).toBeNull();
    expect(lightOf(cafeDay.activities!)).toBe("day");
    expect(lightOf(foodNight.activities!)).toBe("night");
    expect(lightOf([spot("Cafe", "10:00"), spot("Bar", "20:00")])).toBe("night");
    expect(lightOf([])).toBe("day");
  });

  it("ranks all 7 themes, dominant first", () => {
    const r = rankThemes(foodNight.activities!);
    expect(r[0]).toBe("food");
    expect(r[1]).toBe("culture");
    expect(new Set(r).size).toBe(7);
  });

  it("1-day trip: cover, day and summary are distinct and the day matches its spots", () => {
    const t = pickTripBackgrounds("Seoul", [cafeDay], [], lib);
    expect(new Set(all(t)).size).toBe(3);
    expect(all(t).every(Boolean)).toBe(true);
    // days pick first: the day gets its own best fit; the cover takes the same theme in the other light
    expect(slot(t.days[0])).toBe("seoul:cafe-day");
    expect(slot(t.cover)).toBe("seoul:cafe-night");
    expect(slot(t.summary)).toBe("seoul:culture-day");
  });

  it("3-day trip: each day gets its own theme and light, cover = top theme, summary = second theme", () => {
    const t = pickTripBackgrounds("Seoul", [templeDay, foodNight, barNight], [], lib);
    expect(new Set(all(t)).size).toBe(5);
    // trip top theme culture (tie with food broken by default order); 6 of 10 timed spots after 17:00 -> night
    expect(slot(t.cover)).toBe("seoul:culture-night");
    expect(slot(t.days[0])).toBe("seoul:culture-day");
    expect(slot(t.days[1])).toBe("seoul:food-night");
    expect(slot(t.days[2])).toBe("seoul:nightlife-night");
    // summary starts at the 2nd trip theme (food); food-night is day 2 -> same theme in the other light
    expect(slot(t.summary)).toBe("seoul:food-day");
  });

  it("7-day trip: 9 distinct images, every day in the home city and in its own light", () => {
    const week = [cafeDay, foodNight, templeDay, barNight, parkDay, shopDay, walkDay];
    const t = pickTripBackgrounds("Seoul", week, [], lib);
    const images = all(t);
    expect(images.every(Boolean)).toBe(true);
    expect(new Set(images).size).toBe(9);
    expect(images.every((p) => slot(p)!.startsWith("seoul:"))).toBe(true);
    expect(slot(t.days[1])).toBe("seoul:food-night");
    expect(slot(t.days[3])).toBe("seoul:nightlife-night");
    expect(slot(t.days[4])).toBe("seoul:nature-day");
    expect(slot(t.days[5])).toBe("seoul:shopping-day");
    for (const [i, d] of week.entries()) expect(slot(t.days[i])!.endsWith(`-${lightOf(d.activities!)}`)).toBe(true);
  });

  it("never repeats inside a long trip: falls back to the other light, then a same-country city", () => {
    const month = Array.from({ length: 20 }, () => foodNight);
    const t = pickTripBackgrounds("Seoul", month, [], lib);
    const images = all(t);
    expect(images.every(Boolean)).toBe(true);
    expect(new Set(images).size).toBe(images.length);
    const dayImages = t.days as string[];
    expect(slot(dayImages[0])).toBe("seoul:food-night");
    expect(slot(dayImages[1])).toBe("seoul:food-day");
    const firstBusan = dayImages.findIndex((p) => slot(p)!.startsWith("busan:"));
    const firstTokyo = dayImages.findIndex((p) => slot(p)!.startsWith("tokyo:"));
    expect(firstBusan).toBe(14);
    expect(firstTokyo === -1 || firstTokyo > firstBusan).toBe(true);
    expect(dayImages.slice(0, 14).every((p) => slot(p)!.startsWith("seoul:"))).toBe(true);
  });

  it("is deterministic, so parallel per-slide requests agree and stay distinct", () => {
    const trip = [templeDay, foodNight, barNight];
    const slides = [
      libraryStoryBackgroundForSlide("Seoul", "cover", undefined, trip, [], lib),
      ...[1, 2, 3].map((d) => libraryStoryBackgroundForSlide("Seoul", "day", d, trip, [], lib)),
      libraryStoryBackgroundForSlide("Seoul", "summary", undefined, trip, [], lib),
    ];
    expect(slides).toEqual(all(pickTripBackgrounds("Seoul", trip, [], lib)));
    // older clients without days: still a library image, kept apart by their exclude list
    const cover = libraryStoryBackgroundForSlide("Seoul", "cover", undefined, null, [], lib);
    const day1 = libraryStoryBackgroundForSlide("Seoul", "day", 1, null, [cover!], lib);
    expect(cover && day1 && cover !== day1).toBe(true);
    expect(libraryStoryBackgroundForSlide("Seoul", "day", 0, trip, [], lib)).toBeNull();
  });

  it("unknown cities get a stable library city; retired and malformed paths are never picked", () => {
    const a = pickTripBackgrounds("Atlantis", [cafeDay], [], lib);
    expect(a).toEqual(pickTripBackgrounds("Atlantis", [cafeDay], [], lib));
    expect(a.cover).toMatch(/^\/media\/story\/[0-9a-f]{64}\.jpg$/);
    const top = pickTripBackgrounds("Seoul", [cafeDay], [], lib).cover!;
    expect(pickTripBackgrounds("Seoul", [cafeDay], [], { ...lib, retired: [top] }).cover).not.toBe(top);
    const bad: Library = { live: true, story: { seoul: { "cafe-day": "https://x.test/a.webp" } }, activity: {} };
    expect(pickTripBackgrounds("Seoul", [cafeDay], [], bad).cover).toBeNull();
    expect(pickTripBackgrounds("Seoul", [cafeDay], [], { ...lib, live: false })).toEqual({ cover: null, days: [null], summary: null });
  });

  it("sanitizes request days: bounded, strings only, names dropped", () => {
    expect(sanitizePickerDays(undefined)).toBeNull();
    expect(sanitizePickerDays("x")).toBeNull();
    expect(sanitizePickerDays(Array(32).fill({}))).toBeNull();
    expect(sanitizePickerDays([{ activities: Array(33).fill({}) }])).toBeNull();
    expect(sanitizePickerDays([{ activities: [{ category: "Cafe", time: 9, name: "Real Venue" }] }, null]))
      .toEqual([{ activities: [{ category: "Cafe", time: undefined, type: undefined }] }, { activities: [] }]);
  });
});

describe("image library", () => {
  it("maps city spellings to the lib/cities.ts slug", () => {
    expect(librarySlug("Seoul")).toBe("seoul");
    expect(librarySlug("seoul, South Korea")).toBe("seoul");
    expect(librarySlug("Ho Chi Minh City")).toBe("ho-chi-minh");
    expect(librarySlug("Hong Kong")).toBe("hong-kong");
    expect(librarySlug("Atlantis")).toBeNull();
    expect(librarySlug("")).toBeNull();
  });

  it("the shipped manifest: retired paths stay refused, live paths pass the route formats", () => {
    const m = manifest as unknown as Library;
    for (const p of m.retired ?? []) expect(isRetiredLibraryPath(p, true)).toBe(true);
    for (const set of Object.values(m.story)) for (const p of Object.values(set)) {
      expect(p).toMatch(/^\/media\/story\/[0-9a-f]{64}\.jpg$/);
      expect(isRetiredLibraryPath(p)).toBe(!LIBRARY_LIVE);
    }
    for (const set of Object.values(m.activity)) for (const p of Object.values(set)) expect(p).toMatch(/^\/media\/activity\/[0-9a-f]{1,8}\.webp$/);
    for (const [city, set] of Object.entries(m.story)) for (const key of Object.keys(set)) {
      expect(librarySlug(city)).toBe(city);
      if (LIBRARY_LIVE) expect(key).toMatch(/^(cafe|food|nature|culture|nightlife|shopping|neighborhood)-(day|night)$/);
    }
    expect(isRetiredLibraryPath("/media/story/" + "e".repeat(64) + ".png")).toBe(false);
  });

  it("keys activity thumbnails by category, never by venue name", () => {
    expect(libraryCategory("Coffee & dessert")).toBe("cafe");
    expect(libraryCategory("Night market")).toBe("market");
    expect(libraryCategory("Cocktail bar")).toBe("bar");
    expect(libraryCategory(undefined)).toBe("attraction");
    expect(libraryActivityThumbnail("cafe", "Seoul", lib)).toBe("/media/activity/0000beef.webp");
    expect(libraryActivityThumbnail("cafe", "Tokyo", lib)).toBe("/media/activity/00000caf.webp");
    expect(libraryActivityThumbnail("Rooftop sightseeing", "Tokyo", lib)).toBe("/media/activity/0000a77a.webp");
    expect(libraryActivityThumbnail("museum", "Tokyo", lib)).toBeNull();
  });
});

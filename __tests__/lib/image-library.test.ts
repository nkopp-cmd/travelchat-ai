import { describe, expect, it } from "vitest";
import {
  ANY_CITY, libraryActivityThumbnail, libraryCategory, librarySlug, libraryStoryBackground, slideMood, STORY_MOODS,
} from "@/lib/image-library";
import manifest from "@/lib/image-library.json";

const sha = (c: string) => `/media/story/${c.repeat(64)}.jpg`;
const lib = {
  story: { seoul: { skyline: sha("a"), street: sha("b"), food: sha("c"), night: sha("d"), cafe: sha("e"), nature: sha("f") } },
  activity: { seoul: { cafe: "/media/activity/0000beef.webp" }, [ANY_CITY]: { cafe: "/media/activity/00000caf.webp", attraction: "/media/activity/0000a77a.webp" } },
};

describe("image library", () => {
  it("maps city spellings to the lib/cities.ts slug", () => {
    expect(librarySlug("Seoul")).toBe("seoul");
    expect(librarySlug("seoul, South Korea")).toBe("seoul");
    expect(librarySlug("Ho Chi Minh City")).toBe("ho-chi-minh");
    expect(librarySlug("Hong Kong")).toBe("hong-kong");
    expect(librarySlug("Atlantis")).toBeNull();
    expect(librarySlug("")).toBeNull();
  });

  it("gives every slide of a 4-day story its own image (days render in parallel)", () => {
    const slides: Array<[string, number | undefined]> = [["cover", undefined], ["day", 1], ["day", 2], ["day", 3], ["day", 4], ["summary", undefined]];
    const images = slides.map(([type, day]) => libraryStoryBackground("Seoul", type, day, [], lib));
    expect(images.every(Boolean)).toBe(true);
    expect(new Set(images).size).toBe(slides.length);
    expect(new Set(slides.map(([t, d]) => slideMood(t, d))).size).toBe(STORY_MOODS.length);
  });

  it("misses (so the paid API runs) for day 5+, unknown cities, excluded or malformed paths", () => {
    expect(libraryStoryBackground("Seoul", "day", 5, [], lib)).toBeNull();
    expect(libraryStoryBackground("Tokyo", "cover", undefined, [], lib)).toBeNull();
    expect(libraryStoryBackground("Seoul", "cover", undefined, [sha("a")], lib)).toBeNull();
    expect(libraryStoryBackground("Seoul", "cover", undefined, [], { ...lib, story: { seoul: { skyline: "https://x.test/a.webp" } } })).toBeNull();
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

  it("ships a manifest whose paths all pass the route formats", () => {
    for (const moods of Object.values(manifest.story as Record<string, Record<string, string>>))
      for (const path of Object.values(moods)) expect(path).toMatch(/^\/media\/story\/[0-9a-f]{64}\.jpg$/);
    for (const set of Object.values(manifest.activity as Record<string, Record<string, string>>))
      for (const path of Object.values(set)) expect(path).toMatch(/^\/media\/activity\/[0-9a-f]{1,8}\.webp$/);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CityConditions } from "@/components/spots/city-conditions";
import { ENABLED_CITIES } from "@/lib/cities";
import { SEASON_TABLE, localMonth, seasonFor } from "@/lib/season/season-table";
import { summarizeForecast } from "@/lib/weather/met-norway";
import fixture from "../fixtures/met-locationforecast-seoul.json";

describe("season table", () => {
  it("covers twelve reviewed months with sources for every city it lists", () => {
    const enabled = new Set(ENABLED_CITIES.map((city) => city.slug));
    for (const [slug, city] of Object.entries(SEASON_TABLE)) {
      expect(enabled.has(slug), slug).toBe(true);
      expect(city.sources.length).toBeGreaterThan(0);
      expect(city.months).toHaveLength(12);
      for (const month of city.months) {
        expect(month.label.length).toBeGreaterThan(2);
        expect(month.label.length).toBeLessThanOrEqual(24);
        expect(month.tempC[0]).toBeLessThan(month.tempC[1]);
        expect(month.score).toBeGreaterThanOrEqual(1);
        expect(month.score).toBeLessThanOrEqual(5);
      }
    }
  });

  it("covers every city on the landing Weekend pick list and the four Ring 1 cities", () => {
    for (const slug of ["seoul", "tokyo", "bangkok", "singapore", "osaka", "kyoto", "taipei"]) {
      expect(SEASON_TABLE[slug], slug).toBeDefined();
    }
  });

  it("puts known moments in their usual month", () => {
    expect(seasonFor("seoul", 3)?.kind).toBe("blossom");
    expect(seasonFor("seoul", 9)?.kind).toBe("foliage");
    expect(seasonFor("tokyo", 5)?.kind).toBe("rainy");
    expect(seasonFor("bangkok", 3)?.label).toMatch(/Songkran/);
    expect(seasonFor("kyoto", 6)?.label).toMatch(/Gion/);
    expect(seasonFor("nowhere", 0)).toBeNull();
  });

  it("uses the city's own month, so the chip turns over at local midnight", () => {
    const newYearUtcEve = new Date("2026-12-31T16:00:00Z");
    expect(localMonth("Asia/Seoul", newYearUtcEve)).toBe(0);
    expect(localMonth("Europe/London", newYearUtcEve)).toBe(11);
  });
});

describe("city conditions strip", () => {
  const weather = summarizeForecast(fixture as never, "Asia/Seoul");

  it("shows the season chip, current weather, a 7-day forecast and MET attribution", () => {
    const html = renderToStaticMarkup(
      <CityConditions cityName="Seoul" timeZone="Asia/Seoul" season={seasonFor("seoul", 9)} weather={weather} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector('section[aria-label="Season and weather in Seoul"]')).not.toBeNull();
    expect(doc.querySelector('.ll-season-chip[data-kind="foliage"]')?.textContent).toContain("Autumn foliage");
    expect(html).toContain("Good time to go");
    expect(doc.querySelectorAll('ol[aria-label="7-day forecast"] > li')).toHaveLength(7);
    expect(doc.querySelector('a[href="https://api.met.no/doc/License"]')?.textContent).toBe("MET Norway");
    expect(html).not.toContain("<script");
  });

  it("renders the season alone when the forecast is unavailable, and nothing when both are missing", () => {
    const seasonOnly = renderToStaticMarkup(
      <CityConditions cityName="Seoul" timeZone="Asia/Seoul" season={seasonFor("seoul", 6)} weather={null} />,
    );
    expect(seasonOnly).toContain("Monsoon");
    expect(seasonOnly).not.toContain("MET Norway");
    expect(renderToStaticMarkup(<CityConditions cityName="X" timeZone="UTC" season={null} weather={null} />)).toBe("");
  });

  it("animates weather icons only with motion consent", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.ll-wx \.ll-wx-sun/);
  });
});

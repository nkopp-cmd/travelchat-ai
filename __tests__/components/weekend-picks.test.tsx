import { readFileSync, statSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { WEEKEND_PICKS, WeekendPicks } from "@/components/landing/weekend-picks";
import { ENABLED_CITIES } from "@/lib/cities";

const doc = new DOMParser().parseFromString(renderToStaticMarkup(<WeekendPicks />), "text/html");
const css = readFileSync("app/globals.css", "utf8");

describe("weekend picks selector", () => {
  it("lists enabled cities as named links to their spots", () => {
    const enabled = new Set(ENABLED_CITIES.map((city) => city.slug));
    const links = [...doc.querySelectorAll("ol.ll-picks > li.ll-pick > a.ll-pick-card")];
    expect(links).toHaveLength(WEEKEND_PICKS.length);
    for (const [index, pick] of WEEKEND_PICKS.entries()) {
      expect(enabled.has(pick.slug)).toBe(true);
      expect(links[index].getAttribute("href")).toBe(`/spots?city=${pick.slug}`);
      expect(links[index].getAttribute("aria-label")).toBe(`${pick.name}: ${pick.tagline}`);
    }
  });

  it("loads first-party photos lazily, AVIF first, with no script", () => {
    for (const image of doc.querySelectorAll("img")) {
      expect(image.getAttribute("loading")).toBe("lazy");
      expect(image.getAttribute("src")).toMatch(/^\/images\/picks\/[a-z]+-pick-v1-480\.webp$/);
    }
    expect(doc.querySelectorAll('source[type="image/avif"]')).toHaveLength(WEEKEND_PICKS.length);
    expect(doc.querySelector("script")).toBeNull();
  });

  it("snaps to the centre and animates only behind scroll-timeline support and motion consent", () => {
    expect(css).toMatch(/\.ll-picks \{[^}]*scroll-snap-type: y mandatory;/);
    expect(css).toMatch(/\.ll-pick \{[^}]*scroll-snap-align: center;/);
    const gated = css.slice(css.indexOf("@supports (animation-timeline: view())"));
    expect(gated).toMatch(/^@supports \(animation-timeline: view\(\)\) \{\s*@media \(prefers-reduced-motion: no-preference\)/);
    // Distance effects use transform, clip-path, opacity and colour only: no layout properties.
    const keyframes = css.slice(css.indexOf("@keyframes ll-pick-focus"));
    expect(keyframes).not.toMatch(/\b(height|width|margin|padding|top|bottom):/);
  });

  it.each(WEEKEND_PICKS.map((pick) => pick.slug))("%s ships real 3:2 AVIF and WebP variants", async (slug) => {
    for (const [width, max] of [[480, 30_000], [960, 90_000]] as const) {
      const avif = `public/images/picks/${slug}-pick-v1-${width}.avif`;
      expect(await sharp(avif).metadata()).toMatchObject({ format: "heif", width, height: (width * 2) / 3 });
      expect(statSync(avif).size).toBeLessThan(max);
      expect((await sharp(`public/images/picks/${slug}-pick-v1-${width}.webp`).metadata()).format).toBe("webp");
    }
  });
});

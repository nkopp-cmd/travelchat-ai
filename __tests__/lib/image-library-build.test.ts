// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ACTIVITY_CATEGORIES, STORY_LIGHTS, STORY_THEMES } from "@/lib/image-library";
import { ENABLED_CITIES } from "@/lib/cities";
// @ts-expect-error plain .mjs build script without types
import { buildJobs, CITY_FEEL, JOB_CITIES, retiredPaths, THEMES, TOP_CITIES } from "../../scripts/image-library/build.mjs";

type Job = { id: string; prompt: string; formats: string[] };

describe("image library jobs (Nils 2026-11-14: city x theme x light, photo style)", () => {
  const jobs: Job[] = buildJobs(["seoul", "tokyo"]);

  it("makes one story job per city, theme and light, and one generic job per category", () => {
    const ids = jobs.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(THEMES).sort()).toEqual([...STORY_THEMES].sort());
    for (const city of ["seoul", "tokyo"]) for (const t of STORY_THEMES) for (const l of STORY_LIGHTS) expect(ids).toContain(`story-${city}-${t}-${l}`);
    for (const category of ACTIVITY_CATEGORIES) expect(ids).toContain(`act-any-${category}`);
    expect(ids.filter((id) => id.startsWith("story-")).length).toBe(2 * 7 * 2);
  });

  it("asks for generic photographs: no people, text or named venue", () => {
    for (const job of jobs) {
      expect(job.prompt).toMatch(/no named landmark, no real shop or venue/);
      if (job.id.startsWith("story-")) {
        expect(job.prompt).toMatch(/^Professional travel photograph/);
        expect(job.prompt).toMatch(/NO people or crowds/);
        expect(job.prompt).toMatch(/NO text, words, letters/);
      }
      expect(job.formats).toEqual([job.id.startsWith("story-") ? "story" : "square"]);
    }
  });

  it("puts the top 10 cities first, all 7 themes x 2 lights each", () => {
    expect(JOB_CITIES.slice(0, 10)).toEqual(TOP_CITIES);
    expect(new Set(JOB_CITIES).size).toBe(Object.keys(CITY_FEEL).length);
    const first = buildJobs(JOB_CITIES).slice(0, 140).map((j: Job) => j.id.split("-").slice(1, -2).join("-"));
    expect(new Set(first)).toEqual(new Set(TOP_CITIES));
  });

  it("refuses a city without mood text", () => {
    expect(() => buildJobs(["atlantis"])).toThrow(/no mood text/);
  });

  it("has mood text for every enabled city, and only for real city slugs", () => {
    const enabled = ENABLED_CITIES.map((c) => c.slug).sort();
    expect(Object.keys(CITY_FEEL).sort()).toEqual(enabled);
    for (const feel of Object.values(CITY_FEEL) as string[]) expect(feel.length).toBeGreaterThan(40);
  });

  it("retires every old path the new manifest drops, and keeps earlier retired paths", () => {
    const prev = { retired: ["/media/story/r.jpg"], story: { seoul: { morning: "/media/story/a.jpg", "cafe-day": "/media/story/b.jpg" } }, activity: { _: { cafe: "/media/activity/c.webp" } } };
    const next = { story: { seoul: { "cafe-day": "/media/story/b.jpg" } }, activity: { _: { cafe: "/media/activity/d.webp" } } };
    expect(retiredPaths(prev, next)).toEqual(["/media/activity/c.webp", "/media/story/a.jpg", "/media/story/r.jpg"]);
  });
});

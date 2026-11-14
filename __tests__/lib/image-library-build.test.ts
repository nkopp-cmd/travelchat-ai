// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ACTIVITY_CATEGORIES, STORY_MOODS } from "@/lib/image-library";
// @ts-expect-error plain .mjs build script without types
import { buildJobs } from "../../scripts/image-library/build.mjs";

type Job = { id: string; prompt: string; formats: string[] };

describe("image library jobs (reach-engine R8)", () => {
  const jobs: Job[] = buildJobs(["seoul", "tokyo"]);

  it("makes one story job per city and mood, and one generic job per category", () => {
    const ids = jobs.map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const city of ["seoul", "tokyo"]) for (const mood of STORY_MOODS) expect(ids).toContain(`story-${city}-${mood}`);
    for (const category of ACTIVITY_CATEGORIES) expect(ids).toContain(`act-any-${category}`);
  });

  it("asks for illustrations, never a named venue or a photo", () => {
    for (const job of jobs) {
      expect(job.prompt).toMatch(/illustration, not a photograph/);
      expect(job.prompt).toMatch(/no specific real landmark/);
      expect(job.formats).toEqual([job.id.startsWith("story-") ? "story" : "square"]);
    }
  });

  it("refuses a city without mood text", () => {
    expect(() => buildJobs(["atlantis"])).toThrow(/no mood text/);
  });
});

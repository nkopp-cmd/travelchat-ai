import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("itinerary address prompts", () => {
  it("asks new itinerary generation for exact routable addresses", () => {
    const source = readFileSync(
      join(root, "app/api/itineraries/generate/route.ts"),
      "utf8",
    );

    expect(source).toContain("exact street address with district and city");
    expect(source).toContain("include street numbers, lane/section details");
    expect(source).not.toContain("NO street numbers or lane details");
  });

  it("asks itinerary revisions to preserve exact routable addresses", () => {
    const source = readFileSync(
      join(root, "app/api/itineraries/[id]/revise/route.ts"),
      "utf8",
    );

    expect(source).toContain("exact, routable addresses");
    expect(source).toContain("include lane/section/building details");
  });
});

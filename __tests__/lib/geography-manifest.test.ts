import { describe, expect, it } from "vitest";
import { ENABLED_CITIES } from "@/lib/cities";
import {
  GeographyManifestSchema,
  type GeographyManifest,
} from "@/lib/geography/manifest-schema";
import { geographySeedManifest } from "@/lib/geography/seed-manifest";

describe("geography seed manifest", () => {
  it("validates the committed seed manifest", () => {
    expect(() => GeographyManifestSchema.parse(geographySeedManifest)).not.toThrow();
  });

  it("preserves every current destination slug exactly once", () => {
    const parsed = GeographyManifestSchema.parse(geographySeedManifest);
    expect(parsed.destinations.map((destination) => destination.slug).sort()).toEqual(
      ENABLED_CITIES.map((city) => city.slug).sort(),
    );
  });

  it("gives every South Korea and Japan local area provenance and review metadata", () => {
    const parsed = GeographyManifestSchema.parse(geographySeedManifest);
    const corridorAreas = parsed.destinations
      .filter((destination) => ["KR", "JP"].includes(destination.countryCode))
      .flatMap((destination) => destination.localAreas);

    expect(corridorAreas.length).toBeGreaterThan(40);
    for (const area of corridorAreas) {
      expect(area.sourceMeta.source).toBeTruthy();
      expect(area.sourceMeta.license).toBeTruthy();
      expect(area.reviewStatus).toMatch(/machine_checked|human_verified/);
      expect(area.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(area.vibes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("rejects duplicate normalized aliases within an entity", () => {
    const fixture = structuredClone(geographySeedManifest) as GeographyManifest;
    fixture.destinations[0].aliases.push(fixture.destinations[0].aliases[0].toUpperCase());

    const result = GeographyManifestSchema.safeParse(fixture);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes("Duplicate normalized alias"))).toBe(true);
  });

  it("rejects invalid coordinates and unknown vibe axes", () => {
    const fixture = structuredClone(geographySeedManifest) as GeographyManifest;
    fixture.destinations[0].center.lat = 120;
    fixture.destinations[0].localAreas[0].vibes[0].slug = "made-up-vibe" as never;

    const result = GeographyManifestSchema.safeParse(fixture);
    expect(result.success).toBe(false);
  });

  it("rejects destination slug drift from the canonical registry", () => {
    const fixture = structuredClone(geographySeedManifest) as GeographyManifest;
    fixture.destinations[0].slug = "renamed-without-migration";

    const result = GeographyManifestSchema.safeParse(fixture);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes("canonical city registry"))).toBe(true);
  });
});

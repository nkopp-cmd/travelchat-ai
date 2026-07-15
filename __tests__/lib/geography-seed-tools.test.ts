import { describe, expect, it } from "vitest";
import { geographySeedManifest } from "@/lib/geography/seed-manifest";
import {
  buildCountrySeedRows,
  buildDestinationSeedRows,
  buildTypedSnapshotSource,
  destinationAliasRows,
  getGeographyManifestFingerprint,
  getGeographySeedSummary,
} from "@/lib/geography/seed-tools";

describe("geography seed tools", () => {
  it("builds deterministic rows and snapshot output", () => {
    expect(buildCountrySeedRows(geographySeedManifest)).toHaveLength(12);
    expect(buildDestinationSeedRows(geographySeedManifest)).toHaveLength(30);
    expect(buildTypedSnapshotSource(geographySeedManifest)).toBe(
      buildTypedSnapshotSource(structuredClone(geographySeedManifest)),
    );
  });

  it("fingerprints semantic manifest content deterministically", () => {
    const first = getGeographyManifestFingerprint(geographySeedManifest);
    const second = getGeographyManifestFingerprint(structuredClone(geographySeedManifest));
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
  });

  it("reports the launch-corridor coverage packet", () => {
    expect(getGeographySeedSummary(geographySeedManifest)).toMatchObject({
      countries: 12,
      destinations: 30,
      corridorDestinations: 11,
      corridorLocalAreas: 79,
      vibeAxes: 15,
    });
  });

  it("normalizes destination aliases for idempotent upserts", () => {
    expect(destinationAliasRows({
      destinationId: "11111111-1111-1111-1111-111111111111",
      aliases: ["Tōkyō", "東京"],
      source: "fixture",
    })).toEqual([
      expect.objectContaining({ alias: "Tōkyō", normalized_alias: "tōkyō" }),
      expect.objectContaining({ alias: "東京", normalized_alias: "東京" }),
    ]);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { compareCityCountSnapshots } from "@/lib/geography/city-shadow";

describe("geography city shadow comparator", () => {
  it("accepts reordered but contract-equivalent snapshots", () => {
    expect(compareCityCountSnapshots(
      [{ slug: "seoul", spotCount: 390 }, { slug: "tokyo", spotCount: 430 }],
      [{ slug: "tokyo", spotCount: 430 }, { slug: "seoul", spotCount: 390 }],
    )).toEqual({
      equivalent: true,
      legacyTotal: 820,
      databaseTotal: 820,
      missingInDatabase: [],
      unexpectedInDatabase: [],
      countMismatches: [],
    });
  });

  it("reports missing, unexpected, and count differences without changing either input", () => {
    const legacy = [{ slug: "seoul", spotCount: 390 }, { slug: "tokyo", spotCount: 430 }];
    const database = [{ slug: "seoul", spotCount: 389 }, { slug: "osaka", spotCount: 222 }];
    expect(compareCityCountSnapshots(legacy, database)).toMatchObject({
      equivalent: false,
      missingInDatabase: ["tokyo"],
      unexpectedInDatabase: ["osaka"],
      countMismatches: [{ slug: "seoul", legacy: 390, database: 389 }],
    });
    expect(legacy[0].spotCount).toBe(390);
  });
});

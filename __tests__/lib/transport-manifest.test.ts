import { describe, expect, it } from "vitest";
import { directedTransportEdges, transportManifest } from "@/lib/trips/transport-manifest";

describe("KR/JP transport manifest", () => {
  it("expands reviewed routes into at least twenty directed edges", () => {
    expect(transportManifest.routes).toHaveLength(12);
    expect(directedTransportEdges).toHaveLength(24);
  });

  it("keeps conservative durations, buffers, provenance, and recheck dates", () => {
    for (const edge of directedTransportEdges) {
      expect(edge.durationMinutes.max).toBeGreaterThanOrEqual(edge.durationMinutes.min);
      expect(edge.departureBufferMinutes + edge.arrivalBufferMinutes).toBeGreaterThanOrEqual(45);
      expect(edge.sources.length).toBeGreaterThan(0);
      expect(edge.sources.every((item) => item.url.startsWith("https://"))).toBe(true);
      expect(edge.recheckAfter).toBe("2027-01-15");
    }
  });

  it("uses international-flight buffers for Korea/Japan legs", () => {
    const flights = directedTransportEdges.filter((edge) =>
      edge.id.startsWith("seoul-tokyo") || edge.id.startsWith("busan-osaka"),
    );
    expect(flights).toHaveLength(4);
    expect(flights.every((edge) => edge.departureBufferMinutes >= 180 && edge.arrivalBufferMinutes >= 75)).toBe(true);
  });
});

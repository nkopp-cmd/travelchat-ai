import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// generateMetadata and the page both load the itinerary; without React cache() each request
// made two Supabase round trips (signed-in TTFB p75 280-468 ms on 2026-10-21).
describe("itinerary detail server data", () => {
  it("shares one itinerary query between metadata and page per request", () => {
    const source = readFileSync("app/itineraries/[id]/page.tsx", "utf8");
    expect(source).toMatch(/import \{ cache \} from "react";/);
    expect(source).toMatch(/const getItinerary = cache\(async \(id: string\) =>/);
    expect(source).not.toMatch(/async function getItinerary\(/);
  });
});

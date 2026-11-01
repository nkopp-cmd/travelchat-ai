import { describe, expect, it } from "vitest";
import { ITINERARY_SPOT_POOL_LIMIT, itinerarySpotPoolQuery } from "@/app/api/itineraries/generate/spot-pool";

type Call = [string, ...unknown[]];

function recorder() {
  const calls: Call[] = [];
  const query = new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
    get: (_target, method: string) => (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    },
  });
  const client = { from: (table: string) => { calls.push(["from", table]); return query; } };
  return { calls, query: client as never };
}

describe("itinerary spot pool query", () => {
  it("keeps only verified spots of the city BEFORE the row limit", () => {
    const { calls, query } = recorder();
    itinerarySpotPoolQuery(query, "Seoul");

    expect(calls[0]).toEqual(["from", "spots"]);
    expect(calls).toContainEqual(["ilike", "address->>en", "%Seoul%"]);
    expect(calls).toContainEqual(["gte", "localley_score", 3]);
    const verified = calls.findIndex((call) => call[0] === "eq" && call[1] === "verified" && call[2] === true);
    const limit = calls.findIndex((call) => call[0] === "limit");
    expect(verified).toBeGreaterThanOrEqual(0);
    expect(limit).toBe(calls.length - 1);
    expect(verified).toBeLessThan(limit);
    expect(calls[limit]).toEqual(["limit", ITINERARY_SPOT_POOL_LIMIT]);
  });

  it("applies the public visibility filters and the score order", () => {
    const { calls, query } = recorder();
    itinerarySpotPoolQuery(query, "Tokyo");

    expect(calls).toContainEqual(["not", "photos", "is", null]);
    const orders = calls.filter((call) => call[0] === "order").map((call) => call[1]);
    expect(orders).toEqual(["localley_score", "local_percentage"]);
  });
});

import { describe, expect, it } from "vitest";
import { ITINERARY_SPOT_POOL_LIMIT, itinerarySpotPoolQuery } from "@/app/api/itineraries/generate/spot-pool";

type Call = [string, ...unknown[]];
type Result = { data: unknown[] | null; error: { message: string } | null };

/** One recorded chain per from("spots"); awaiting a chain resolves the next queued result. */
function recorder(results: Result[]) {
  const chains: Call[][] = [];
  const client = {
    from: (table: string) => {
      const calls: Call[] = [["from", table]];
      chains.push(calls);
      const result = results[chains.length - 1] ?? { data: [], error: null };
      const query: Record<string, unknown> = new Proxy({}, {
        get: (_target, method: string) => method === "then"
          ? (resolve: (value: Result) => unknown) => resolve(result)
          : (...args: unknown[]) => { calls.push([method, ...args]); return query; },
      });
      return query;
    },
  };
  return { chains, client: client as never };
}

const row = (id: string, localley_score: number, local_percentage = 50) => ({ id, localley_score, local_percentage });

describe("itinerary spot pool query", () => {
  it("matches the /spots city rule: city column, or no city and the address", async () => {
    const { chains, client } = recorder([]);
    await itinerarySpotPoolQuery(client, "Ho Chi Minh City");

    expect(chains).toHaveLength(2);
    expect(chains[0]).toContainEqual(["eq", "city", "Ho Chi Minh City"]);
    expect(chains[0].some((call) => call[0] === "ilike")).toBe(false);
    expect(chains[1]).toContainEqual(["is", "city", null]);
    expect(chains[1]).toContainEqual(["ilike", "address->>en", "%Ho Chi Minh City%"]);
  });

  it("keeps only verified spots of the city BEFORE the row limit, in both queries", async () => {
    const { chains, client } = recorder([]);
    await itinerarySpotPoolQuery(client, "Seoul");

    for (const calls of chains) {
      expect(calls[0]).toEqual(["from", "spots"]);
      expect(calls).toContainEqual(["gte", "localley_score", 3]);
      const verified = calls.findIndex((call) => call[0] === "eq" && call[1] === "verified" && call[2] === true);
      const limit = calls.findIndex((call) => call[0] === "limit");
      expect(verified).toBeGreaterThanOrEqual(0);
      expect(limit).toBe(calls.length - 1);
      expect(verified).toBeLessThan(limit);
      expect(calls[limit]).toEqual(["limit", ITINERARY_SPOT_POOL_LIMIT]);
      expect(calls).toContainEqual(["not", "photos", "is", null]);
      expect(calls.filter((call) => call[0] === "order").map((call) => call[1])).toEqual(["localley_score", "local_percentage"]);
    }
  });

  it("merges both results in score order and cuts to the limit", async () => {
    const byColumn = Array.from({ length: ITINERARY_SPOT_POOL_LIMIT }, (_, i) => row(`c${i}`, i % 2 ? 6 : 4));
    const byAddress = [row("a-top", 7), row("a-tie", 6, 90), row("a-low", 3)];
    const { client } = recorder([{ data: byColumn, error: null }, { data: byAddress, error: null }]);
    const { data, error } = await itinerarySpotPoolQuery(client, "Hanoi");

    expect(error).toBeNull();
    expect(data).toHaveLength(ITINERARY_SPOT_POOL_LIMIT);
    const ids = (data as { id: string }[]).map((spot) => spot.id);
    expect(ids.slice(0, 2)).toEqual(["a-top", "a-tie"]);
    expect(ids).not.toContain("a-low");
    const scores = (data as { localley_score: number }[]).map((spot) => spot.localley_score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("returns the first query error and no rows", async () => {
    const { client } = recorder([{ data: [row("c", 5)], error: null }, { data: null, error: { message: "boom" } }]);
    await expect(itinerarySpotPoolQuery(client, "Tokyo")).resolves.toEqual({ data: null, error: { message: "boom" } });
  });
});

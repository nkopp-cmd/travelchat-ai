// Push BM1: the warm job is a self-repeating cost path, so prove its caps: one request per Ring-1 city, the exact
// wizard preset body, a gap between requests, no retry after a failure.
import { describe, expect, it, vi } from "vitest";
import { PLAN_PRESET } from "@/lib/trips/plan-cache";
// @ts-expect-error plain ESM script without types
import { PRESET_BODY, WARM_CITIES, warmFreePlans } from "../../scripts/warm-free-plans.mjs";

vi.mock("server-only", () => ({}));

describe("warmFreePlans", () => {
  it("sends the wizard preset once per Ring-1 city, 20 s apart, and reports hit / regenerated / fail", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const replies = [
      { status: 200, json: { success: true, meta: { cached: true } } },
      { status: 200, json: { success: true, meta: {} } },
      { status: 500, json: { success: false } },
      { status: 200, json: { success: true, meta: { cached: true } } },
    ];
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      const reply = replies[bodies.length - 1];
      return { status: reply.status, json: async () => reply.json } as unknown as Response;
    });
    const sleep = vi.fn(async () => {});
    const results = await warmFreePlans({ base: "https://x.test", fetchImpl, sleep, log: () => {} });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://x.test/api/itineraries/generate");
    expect(bodies.map((b) => b.city)).toEqual(["Seoul", "Tokyo", "Bangkok", "Singapore"]);
    expect(WARM_CITIES).toHaveLength(4);
    for (const body of bodies) expect(body).toMatchObject({ ...PLAN_PRESET, interests: [] });
    expect(PRESET_BODY).toEqual({ ...PLAN_PRESET, interests: [] });
    expect(sleep.mock.calls).toEqual([[20_000], [20_000], [20_000]]);
    expect(results.map((r: { ok: boolean; cached: boolean }) => [r.ok, r.cached])).toEqual([
      [true, true], [true, false], [false, false], [true, true],
    ]);
  });

  it("records a network error and still makes no more than one request per city", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("offline"); });
    const results = await warmFreePlans({ base: "https://x.test", fetchImpl, sleep: async () => {}, log: () => {} });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(results.every((r: { ok: boolean; status: number }) => !r.ok && r.status === 0)).toBe(true);
  });
});

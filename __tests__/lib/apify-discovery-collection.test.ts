import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
import { collectActiveApifySpotDiscovery } from "@/lib/apify-spot-discovery";

describe("existing discovery collection", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  function setup(data: unknown, error: unknown = null) {
    vi.stubEnv("APIFY_SPOT_DISCOVERY_ENABLED", "true"); vi.stubEnv("APIFY_API_TOKEN", "test-only");
    const query = { select: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() };
    for (const method of [query.select, query.in, query.order, query.limit]) method.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data, error });
    const from = vi.fn().mockReturnValue(query); mocks.admin.mockReturnValue({ from });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: "RUNNING" } })));
    vi.stubGlobal("fetch", fetch);
    return { from, fetch };
  }
  it("skips disabled discovery without credentials, database access or provider calls", async () => {
    vi.stubEnv("APIFY_SPOT_DISCOVERY_ENABLED", "false");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await collectActiveApifySpotDiscovery()).toMatchObject({ state: "disabled", candidates: 0 });
    expect(mocks.admin).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not start an actor when no run exists", async () => {
    const { from, fetch } = setup(null);
    expect(await collectActiveApifySpotDiscovery()).toMatchObject({ state: "idle", candidates: 0 });
    expect(from).toHaveBeenCalledExactlyOnceWith("apify_spot_discovery_runs");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads an old actor before deciding its outcome; never aborts or starts another actor", async () => {
    const { from, fetch } = setup({ id: "run", state: "running", actor_run_id: "actor-1",
      started_at: "2026-10-01T02:23:00Z", discovery_date: "2026-10-01", city_slug: "jeju" });
    expect(await collectActiveApifySpotDiscovery(new Date("2026-10-09T03:00:00Z")))
      .toMatchObject({ state: "pending", citySlug: "jeju" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://api.apify.com/v2/actor-runs/actor-1");
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
    expect(from).toHaveBeenCalledExactlyOnceWith("apify_spot_discovery_runs");
  });
  it("refuses a database error without querying the provider", async () => {
    const { fetch } = setup(null, { message: "unavailable" });
    await expect(collectActiveApifySpotDiscovery()).rejects.toThrow("Could not load active");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("collects a delayed successful actor without starting, aborting or publishing spots", async () => {
    vi.stubEnv("APIFY_SPOT_DISCOVERY_ENABLED", "true"); vi.stubEnv("APIFY_API_TOKEN", "test-only");
    const run = { id: "run", state: "running", actor_run_id: "actor-1", started_at: "2026-10-01T02:23:00Z",
      discovery_date: "2026-10-01", city_slug: "jeju" };
    const update = vi.fn();
    const from = vi.fn().mockImplementation(() => {
      const q: Record<string, unknown> = {};
      for (const name of ["select", "in", "order", "limit", "eq"]) q[name] = vi.fn().mockReturnValue(q);
      q.update = vi.fn().mockImplementation((value) => { update(value); return q; });
      q.maybeSingle = vi.fn().mockResolvedValue({ data: run, error: null });
      q.then = (resolve: (value: unknown) => void) => resolve({ data: [], error: null });
      return q;
    });
    mocks.admin.mockReturnValue({ from });
    const fetch = vi.fn().mockImplementation(async (url: string) => new Response(JSON.stringify(
      url.includes("/actor-runs/") ? { data: { status: "SUCCEEDED", defaultDatasetId: "dataset-1" } } : [])));
    vi.stubGlobal("fetch", fetch);
    expect(await collectActiveApifySpotDiscovery(new Date("2026-10-09T03:00:00Z")))
      .toMatchObject({ state: "processed", candidates: 0, skippedExisting: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "https://api.apify.com/v2/actor-runs/actor-1", "https://api.apify.com/v2/datasets/dataset-1/items?clean=true&limit=100",
    ]);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded", dataset_id: "dataset-1" }));
    expect(from.mock.calls.map((call) => call[0])).not.toContain("spots");
  });
});

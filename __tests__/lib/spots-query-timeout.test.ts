import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SPOTS_QUERY_TIMEOUT_MS,
  resolveSpotsQueryWithTimeout,
} from "@/lib/spots/queries";

describe("spots query timeout", () => {
  afterEach(() => {
    delete process.env.SPOTS_QUERY_TIMEOUT_MS;
    vi.useRealTimers();
  });

  it("resolves fast Supabase query promises normally", async () => {
    await expect(
      resolveSpotsQueryWithTimeout(
        Promise.resolve({ data: [{ id: "spot_1" }], error: null }),
        "spots test query",
      ),
    ).resolves.toEqual({
      data: [{ id: "spot_1" }],
      error: null,
    });
  });

  it("rejects slow Supabase query promises with a bounded timeout", async () => {
    vi.useFakeTimers();
    process.env.SPOTS_QUERY_TIMEOUT_MS = "5";

    const pendingQuery = new Promise(() => undefined);
    const queryPromise = resolveSpotsQueryWithTimeout(
      pendingQuery,
      "spots test query",
    );
    const assertion = expect(queryPromise).rejects.toThrow(
      "spots test query timed out after 5ms",
    );

    await vi.advanceTimersByTimeAsync(5);

    await assertion;
  });

  it("uses the default timeout when the env override is invalid", async () => {
    vi.useFakeTimers();
    process.env.SPOTS_QUERY_TIMEOUT_MS = "0";

    const pendingQuery = new Promise(() => undefined);
    const queryPromise = resolveSpotsQueryWithTimeout(
      pendingQuery,
      "spots default query",
    );
    const assertion = expect(queryPromise).rejects.toThrow(
      `spots default query timed out after ${DEFAULT_SPOTS_QUERY_TIMEOUT_MS}ms`,
    );

    await vi.advanceTimersByTimeAsync(DEFAULT_SPOTS_QUERY_TIMEOUT_MS);

    await assertion;
  });
});

import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  refetchUntilPaid,
  SUCCESS_REFETCH_DELAY_MS,
  SUCCESS_REFETCH_MAX,
} from "@/components/subscription/subscription-success-handler";
import { queryKeys } from "@/hooks/query-keys";

/** Runs scheduled ticks by hand so the test sees every delay and can count runs. */
function harness(tiers: string[]) {
  const client = new QueryClient();
  let fetches = 0;
  vi.spyOn(client, "refetchQueries").mockImplementation(async () => {
    const tier = tiers[Math.min(fetches, tiers.length - 1)];
    fetches += 1;
    client.setQueryData(queryKeys.subscription, { tier });
  });
  const pending: Array<{ run: () => void; ms: number }> = [];
  const schedule = (run: () => void, ms: number) => pending.push({ run, ms });
  const drain = async () => {
    for (let guard = 0; guard < 50; guard += 1) {
      await new Promise((r) => setTimeout(r, 0));
      const next = pending.shift();
      if (!next) return;
      expect(next.ms).toBe(SUCCESS_REFETCH_DELAY_MS);
      next.run();
    }
    throw new Error("refetch loop did not stop");
  };
  return { client, schedule, drain, fetches: () => fetches };
}

describe("post-checkout subscription refetch", () => {
  it("stops after the cap when the webhook never lands", async () => {
    const h = harness(["free"]);
    const loop = refetchUntilPaid(h.client, h.schedule);
    await h.drain();
    expect(h.fetches()).toBe(SUCCESS_REFETCH_MAX);
    expect(loop.runs()).toBe(SUCCESS_REFETCH_MAX);
    expect(SUCCESS_REFETCH_MAX).toBeLessThanOrEqual(5);
  });

  it.each([
    [["pro"], 1],
    [["free", "free", "premium"], 3],
  ])("stops as soon as the paid tier shows (%j)", async (tiers, expected) => {
    const h = harness(tiers);
    refetchUntilPaid(h.client, h.schedule);
    await h.drain();
    expect(h.fetches()).toBe(expected);
  });

  it("stops at once when stopped (unmount)", async () => {
    const h = harness(["free"]);
    const loop = refetchUntilPaid(h.client, h.schedule);
    loop.stop();
    await h.drain();
    expect(h.fetches()).toBe(1);
  });

  it("a failed status read counts as a try and still stops", async () => {
    const client = new QueryClient();
    const refetch = vi.spyOn(client, "refetchQueries").mockRejectedValue(new Error("offline"));
    const pending: Array<() => void> = [];
    refetchUntilPaid(client, (run) => pending.push(run));
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 0));
      pending.shift()?.();
    }
    expect(refetch).toHaveBeenCalledTimes(SUCCESS_REFETCH_MAX);
  });
});

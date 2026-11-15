import { describe, expect, it, vi } from "vitest";
import { PAID_RETURN_DELAY_MS, PAID_RETURN_MAX, waitForPaidTier } from "@/lib/trips/paid-return";

const noSleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);

describe("waitForPaidTier", () => {
  it("stops after the cap when the plan stays free", async () => {
    const read = vi.fn(async () => "free");
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined);
    await expect(waitForPaidTier(read, { sleep })).resolves.toBe("pending");
    expect(read).toHaveBeenCalledTimes(PAID_RETURN_MAX);
    expect(sleep).toHaveBeenCalledTimes(PAID_RETURN_MAX - 1);
    expect(sleep.mock.calls.every(([ms]) => ms === PAID_RETURN_DELAY_MS)).toBe(true);
    expect(PAID_RETURN_MAX).toBeLessThanOrEqual(5);
  });

  it.each([
    [["pro"], 1, "paid"],
    [["free", "premium"], 2, "paid"],
    [["free", null, undefined, "free", "pro"], 5, "paid"],
  ] as const)("returns as soon as a paid tier shows (%j)", async (tiers, reads, result) => {
    let n = 0;
    const read = vi.fn(async () => tiers[n++]);
    await expect(waitForPaidTier(read, { sleep: noSleep })).resolves.toBe(result);
    expect(read).toHaveBeenCalledTimes(reads);
  });

  it("counts failed reads as tries and still stops", async () => {
    const read = vi.fn(async () => { throw new Error("offline"); });
    await expect(waitForPaidTier(read, { sleep: noSleep })).resolves.toBe("pending");
    expect(read).toHaveBeenCalledTimes(PAID_RETURN_MAX);
  });

  it("stops at once when the page is gone", async () => {
    let gone = false;
    const read = vi.fn(async () => { gone = true; return "free"; });
    await expect(waitForPaidTier(read, { sleep: noSleep, stopped: () => gone })).resolves.toBe("stopped");
    expect(read).toHaveBeenCalledTimes(1);
  });
});

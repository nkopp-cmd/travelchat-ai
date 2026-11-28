import { describe, expect, it, vi } from "vitest";
import { isolateMemo } from "@/lib/isolate-memo";

describe("isolateMemo", () => {
  it("reuses a result inside the TTL and reloads after it", async () => {
    let t = 0;
    const load = vi.fn(async (city: string) => `${city}-${load.mock.calls.length}`);
    const memo = isolateMemo(load, 1000, 64, () => t);
    expect(await memo("seoul")).toBe("seoul-1");
    t = 999;
    expect(await memo("seoul")).toBe("seoul-1");
    expect(await memo("tokyo")).toBe("tokyo-2");
    t = 1000;
    expect(await memo("seoul")).toBe("seoul-3");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("never keeps a failed load", async () => {
    let fail = true;
    const memo = isolateMemo(async () => { if (fail) throw new Error("x"); return 1; }, 60_000);
    await expect(memo()).rejects.toThrow("x");
    fail = false;
    expect(await memo()).toBe(1);
  });

  it("holds at most maxEntries keys", async () => {
    const load = vi.fn(async (n: number) => n);
    const memo = isolateMemo(load, 60_000, 2);
    await memo(1); await memo(2); await memo(3);
    await memo(1);
    expect(load).toHaveBeenCalledTimes(4);
  });
});

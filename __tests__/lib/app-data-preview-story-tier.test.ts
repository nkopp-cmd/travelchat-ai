import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));

import { previewStoryTier } from "@/lib/app-data/preview-story-tier";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

function rows(results: unknown[]) {
  const all = vi.fn().mockResolvedValue({ results });
  const bind = vi.fn().mockReturnValue({ all });
  const prepare = vi.fn().mockReturnValue({ bind });
  mocks.reader.mockReturnValue({ prepare });
  return { prepare, bind };
}

describe("preview story retention tier", () => {
  it("reads only the exact imported owner subscription", async () => {
    process.env = { ...originalEnvironment, BETA_MODE: "false" };
    const { prepare, bind } = rows([{ tier: "pro", status: "active" }]);
    expect(await previewStoryTier("owner-id", "ordinary@example.test")).toBe("pro");
    expect(prepare.mock.calls[0][0]).toContain("o.clerkUserId = ?");
    expect(bind).toHaveBeenCalledWith("owner-id", "auth:owner-id");
    rows([{ tier: "premium", status: "trialing" }]);
    expect(await previewStoryTier("owner-id", null)).toBe("premium");
  });

  it("returns free for absent or inactive subscriptions", async () => {
    process.env = { ...originalEnvironment, BETA_MODE: "false" };
    rows([]);
    expect(await previewStoryTier("owner-id", null)).toBe("free");
    rows([{ tier: "premium", status: "canceled" }]);
    expect(await previewStoryTier("owner-id", null)).toBe("free");
  });

  it("keeps beta and lifetime premium overrides without a subscription read", async () => {
    process.env = { ...originalEnvironment, BETA_MODE: "true" };
    expect(await previewStoryTier("owner-id", null)).toBe("premium");
    process.env = { ...originalEnvironment, BETA_MODE: "false" };
    expect(await previewStoryTier("owner-id", "hello@localley.io")).toBe("premium");
    expect(mocks.reader).not.toHaveBeenCalled();
  });

  it("rejects ambiguous or invalid active paid records", async () => {
    process.env = { ...originalEnvironment, BETA_MODE: "false" };
    rows([{ tier: "pro", status: "active" }, { tier: "premium", status: "active" }]);
    await expect(previewStoryTier("owner-id", null)).rejects.toThrow("Ambiguous");
    rows([{ tier: "unknown", status: "active" }]);
    await expect(previewStoryTier("owner-id", null)).rejects.toThrow("Invalid");
  });
});

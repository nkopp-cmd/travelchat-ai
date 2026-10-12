import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), limiter: vi.fn(), sourceUsage: vi.fn(), source: vi.fn(),
  admit: vi.fn(), context: vi.fn(), usage: vi.fn(), model: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => mocks.limiter }));
vi.mock("@/lib/usage-tracking", () => ({ checkAndIncrementUsage: mocks.sourceUsage }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/app-data/preview-chat-request", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-chat-request")>(),
  admitFreshPreviewChatOwner: mocks.admit,
}));
vi.mock("@/lib/app-data/preview-chat-spots", () => ({ previewChatSpotContext: mocks.context }));
vi.mock("@/lib/app-data/preview-chat-usage", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-chat-usage")>(),
  incrementPreviewChatUsage: mocks.usage,
}));
vi.mock("@/lib/llm/chat-provider", () => ({ generateChatReplyWithFallback: mocks.model }));
import { POST } from "@/app/api/chat/route";
const reply = { content: "A local reply", provider: "openai", model: "test", fallbackUsed: false,
  fallbackReason: null, primaryProvider: "openai", primaryModel: "test", primaryConfigured: true };
const usage = { allowed: true, currentUsage: 1, limit: 10, remaining: 9, periodResetAt: "2026-10-13" };
function request(value: unknown = { messages: [{ role: "user", content: "Seoul food" }] }, host = "localley-next-preview.nkopp.workers.dev", query = "?data_candidate=d1") {
  return new NextRequest(`https://${host}/api/chat${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_MAIL_MODE", "outbox"); vi.stubEnv("SUPABASE_READ_ONLY", "true");
  vi.stubEnv("PREVIEW_CHAT_GENERATION", "true"); vi.stubEnv("OPENAI_API_KEY", "test-not-real");
  mocks.auth.mockResolvedValue({ userId: "fresh" }); mocks.admit.mockResolvedValue(undefined);
  mocks.context.mockResolvedValue({ city: "Seoul", context: "COUNTED D1 SPOTS" });
  mocks.usage.mockResolvedValue(usage); mocks.model.mockResolvedValue(reply);
  mocks.limiter.mockResolvedValue(null);
  mocks.sourceUsage.mockResolvedValue({ allowed: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
});
describe("candidate chat admission and submission", () => {
  it("uses counted context and one D1 reservation, without Source or Redis", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await response.json()).toEqual({ ...reply, content: undefined, message: reply.content });
    expect(mocks.context).toHaveBeenCalledWith("Seoul", "Seoul food");
    expect(mocks.model).toHaveBeenCalledOnce();
    expect(mocks.model.mock.calls[0][0].systemPrompt).toContain("COUNTED D1 SPOTS");
    expect(mocks.admit.mock.invocationCallOrder[0]).toBeLessThan(mocks.context.mock.invocationCallOrder[0]);
    expect(mocks.context.mock.invocationCallOrder[0]).toBeLessThan(mocks.usage.mock.invocationCallOrder[0]);
    expect(mocks.usage.mock.invocationCallOrder[0]).toBeLessThan(mocks.model.mock.invocationCallOrder[0]);
    expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.sourceUsage).not.toHaveBeenCalled();
    expect(mocks.limiter).not.toHaveBeenCalled();
  });
  it.each(["false", "", "TRUE"])("refuses disabled flag %s without writes or model", async flag => {
    vi.stubEnv("PREVIEW_CHAT_GENERATION", flag);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.admit).not.toHaveBeenCalled(); expect(mocks.usage).not.toHaveBeenCalled(); expect(mocks.model).not.toHaveBeenCalled();
  });
  it("refuses missing provider credential before any D1 access", async () => {
    vi.stubEnv("OPENAI_API_KEY", " ");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.admit).not.toHaveBeenCalled(); expect(mocks.model).not.toHaveBeenCalled();
  });
  it("refuses anonymous callers", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request())).status).toBe(401); expect(mocks.usage).not.toHaveBeenCalled();
  });
  it("refuses foreign, unverified or historical owners without context or quota access", async () => {
    mocks.admit.mockRejectedValue(new Error("not reserved fresh"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.usage).not.toHaveBeenCalled(); expect(mocks.model).not.toHaveBeenCalled();
  });
  it("refuses incomplete context before quota or paid submission", async () => {
    mocks.context.mockRejectedValue(new Error("Import incomplete"));
    expect((await POST(request())).status).toBe(503); expect(mocks.usage).not.toHaveBeenCalled(); expect(mocks.model).not.toHaveBeenCalled();
  });
  it("refuses an unknown explicit city before quota", async () => {
    mocks.context.mockRejectedValue(new RangeError("Unknown city"));
    expect((await POST(request({ messages: [{ role: "user", content: "hello" }], city: "Unknown" }))).status).toBe(400);
    expect(mocks.usage).not.toHaveBeenCalled();
  });
  it("keeps city-first chat available without inventing context", async () => {
    expect((await POST(request({ messages: [{ role: "user", content: "hello" }] }))).status).toBe(200);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.model.mock.calls[0][0].systemPrompt).toContain("ASK FOR CITY FIRST");
  });
  it("denies exhausted quota without a model or Source fallback", async () => {
    mocks.usage.mockResolvedValue({ ...usage, allowed: false, remaining: 0 });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.model).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled();
  });
  it("does not resubmit a failed model call or fall back to Source", async () => {
    mocks.model.mockRejectedValue(new Error("unknown provider outcome"));
    const response = await POST(request());
    expect(response.status).toBe(503); expect(mocks.model).toHaveBeenCalledOnce();
    expect(mocks.usage).toHaveBeenCalledOnce(); expect(mocks.source).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("provider outcome");
  });
  it("refuses oversized body and unsupported fields before quota", async () => {
    for (const value of [{ messages: [{ role: "user", content: "x".repeat(70000) }] },
      { messages: [{ role: "user", content: "Seoul" }], model: "override" }]) {
      expect((await POST(request(value))).status).toBe(400);
    }
    expect(mocks.usage).not.toHaveBeenCalled(); expect(mocks.model).not.toHaveBeenCalled();
  });
  it.each([["www.localley.io", "?data_candidate=d1"], ["localley-next-preview.nkopp.workers.dev", ""]])(
    "preserves ordinary routing on %s%s", async (host, query) => {
      const response = await POST(request({ messages: [{ role: "user", content: "hello" }] }, host, query));
      expect(response.status).toBe(200); expect(response.headers.has("X-Localley-Data-Source")).toBe(false);
      expect(mocks.limiter).toHaveBeenCalledOnce(); expect(mocks.sourceUsage).toHaveBeenCalledOnce();
      expect(mocks.admit).not.toHaveBeenCalled(); expect(mocks.usage).not.toHaveBeenCalled();
    });
});

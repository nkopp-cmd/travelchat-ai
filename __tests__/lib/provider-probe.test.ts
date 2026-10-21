import { describe, expect, it, vi } from "vitest";
import { probeGemini, probeOpenAI, runProviderProbes } from "@/lib/llm/provider-probe";

const reply = (status: number, body = "{}") => vi.fn(async () => new Response(body, { status }));

describe("AI provider probe", () => {
  it("reports a healthy OpenAI key with a 16-token completion on the itinerary model", async () => {
    const fetchImpl = reply(200);
    const result = await probeOpenAI(" sk-test ", fetchImpl);
    expect(result).toMatchObject({ provider: "openai", ok: true, status: 200, reason: "ok" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "gpt-6-luna", max_completion_tokens: 16 });
  });

  it("classifies an invalid key, quota and upstream errors without echoing upstream text", async () => {
    const secretEcho = JSON.stringify({ error: { message: "Incorrect API key provided: sk-abc***" } });
    const invalid = await probeOpenAI("sk-bad", reply(401, secretEcho));
    expect(invalid).toMatchObject({ ok: false, status: 401, reason: "auth_failed" });
    expect(JSON.stringify(invalid)).not.toContain("sk-");
    expect(await probeOpenAI("sk", reply(429))).toMatchObject({ ok: false, reason: "quota_or_rate_limit" });
    expect(await probeGemini("g", reply(500))).toMatchObject({ ok: false, reason: "upstream_error" });
  });

  it("fails a missing key without a request and a network error as status 0", async () => {
    const fetchImpl = reply(200);
    expect(await probeOpenAI("  ", fetchImpl)).toMatchObject({ ok: false, status: 0, reason: "missing_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
    const thrown = vi.fn(async () => { throw new Error("timeout"); });
    expect(await probeGemini("g", thrown)).toMatchObject({ ok: false, status: 0, reason: "network_error" });
  });

  it("is healthy only when every provider is healthy", async () => {
    const fetchImpl = vi.fn(async (url: string) => new Response("{}", { status: url.includes("openai") ? 200 : 403 }));
    const result = await runProviderProbes({ OPENAI_API_KEY: "sk", GEMINI_API_KEY: "g" }, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.results.map((entry) => entry.reason)).toEqual(["ok", "auth_failed"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

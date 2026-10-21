import { TEXT_MODEL } from "@/lib/llm/env";

export type ProbeName = "openai" | "gemini";

export interface ProbeResult {
  provider: ProbeName;
  ok: boolean;
  /** Upstream HTTP status, 0 for a missing key or a network/timeout failure. */
  status: number;
  reason: "ok" | "missing_key" | "auth_failed" | "quota_or_rate_limit" | "upstream_error" | "network_error";
  latencyMs: number;
}

const PROBE_TIMEOUT_MS = 15_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

function classify(status: number): ProbeResult["reason"] {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "auth_failed";
  if (status === 429) return "quota_or_rate_limit";
  return "upstream_error";
}

async function timed(
  provider: ProbeName,
  key: string | undefined,
  call: (key: string) => Promise<Response>,
): Promise<ProbeResult> {
  const started = Date.now();
  if (!key?.trim()) return { provider, ok: false, status: 0, reason: "missing_key", latencyMs: 0 };
  try {
    const response = await call(key.trim());
    // Drain the body; never return or log upstream text (it can echo request details).
    await response.arrayBuffer().catch(() => undefined);
    const reason = classify(response.status);
    return { provider, ok: reason === "ok", status: response.status, reason, latencyMs: Date.now() - started };
  } catch {
    return { provider, ok: false, status: 0, reason: "network_error", latencyMs: Date.now() - started };
  }
}

/**
 * The smallest real request that proves the Worker's key can generate text:
 * a 16-token completion on the itinerary model (a 1-token cap is rejected by the model).
 */
export function probeOpenAI(key: string | undefined, fetchImpl: FetchLike = fetch): Promise<ProbeResult> {
  return timed("openai", key, (apiKey) => fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: "user", content: "Reply with: ok" }],
      max_completion_tokens: 16,
      reasoning_effort: "none",
    }),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }));
}

/** Gemini key check through the free model list (no generation). */
export function probeGemini(key: string | undefined, fetchImpl: FetchLike = fetch): Promise<ProbeResult> {
  return timed("gemini", key, (apiKey) => fetchImpl("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
    method: "GET",
    headers: { "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }));
}

export async function runProviderProbes(
  env: { OPENAI_API_KEY?: string; GEMINI_API_KEY?: string; GOOGLE_AI_API_KEY?: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: boolean; results: ProbeResult[] }> {
  const results = await Promise.all([
    probeOpenAI(env.OPENAI_API_KEY, fetchImpl),
    probeGemini(env.GEMINI_API_KEY || env.GOOGLE_AI_API_KEY, fetchImpl),
  ]);
  return { ok: results.every((result) => result.ok), results };
}

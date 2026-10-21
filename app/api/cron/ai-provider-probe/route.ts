import { NextRequest, NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { runProviderProbes } from "@/lib/llm/provider-probe";

/**
 * GET /api/cron/ai-provider-probe
 * Proves the Worker's own AI keys still work (OpenAI itinerary text, Gemini images),
 * so a broken key alerts the team before a user hits it. Called by the agent-host
 * cron (HYBRID RULE); one bounded request per provider, no retries.
 * Returns 200 when every provider is healthy, 503 otherwise. Never returns key or upstream text.
 */
export async function GET(req: NextRequest) {
    if (!isCronRequestAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { ok, results } = await runProviderProbes({
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
    });
    if (!ok) {
        console.error("[AI_PROVIDER_PROBE] Provider check failed", results.map(({ provider, status, reason }) => ({ provider, status, reason })));
    }
    return NextResponse.json(
        { ok, checkedAt: new Date().toISOString(), results },
        { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
}

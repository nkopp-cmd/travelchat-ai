#!/usr/bin/env node
// Push BM1: keep the "Free 3-day plan" preset ready for the Ring-1 cities, so the FIRST visitor gets it in < 1.5 s.
// Runs from the agent-host crontab once a day. Hard caps: one pass, 4 cities, 1 request each, 20 s apart, 90 s
// timeout per request, no retries. A cache hit costs nothing; a miss (entry older than 7 d) runs one model call.
// The route keeps the preset 8 d (lib/trips/plan-cache.ts), so a daily pass regenerates on day 7 with no gap.
//
// Usage: node scripts/warm-free-plans.mjs [--spend-file <SPEND.md>] [--base https://www.localley.io]
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const WARM_CITIES = ["Seoul", "Tokyo", "Bangkok", "Singapore"];
// Must match components/itineraries/wizard/wizard-context.tsx defaultData and PLAN_PRESET in lib/trips/plan-cache.ts.
export const PRESET_BODY = { days: 3, interests: [], budget: "moderate", localnessLevel: 3, pace: "moderate", groupType: "solo" };
const GAP_MS = 20_000;
const TIMEOUT_MS = 90_000;
const USD_PER_MISS = 0.01;

export async function warmFreePlans({ base, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log }) {
  const results = [];
  for (const [index, city] of WARM_CITIES.entries()) {
    if (index > 0) await sleep(GAP_MS);
    const started = Date.now();
    try {
      const response = await fetchImpl(`${base}/api/itineraries/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "localley-warm-free-plans/1" },
        body: JSON.stringify({ city, ...PRESET_BODY }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await response.json().catch(() => null);
      const ok = response.status === 200 && body?.success === true;
      const cached = body?.meta?.cached === true;
      results.push({ city, ok, cached, status: response.status, ms: Date.now() - started });
    } catch (error) {
      results.push({ city, ok: false, cached: false, status: 0, ms: Date.now() - started, error: String(error?.name ?? error) });
    }
    const r = results.at(-1);
    log(`${new Date().toISOString()} warm ${r.city} status=${r.status} ${r.ok ? (r.cached ? "hit" : "regenerated") : "FAIL"} ${r.ms}ms`);
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const base = (arg("--base") ?? "https://www.localley.io").replace(/\/$/, "");
  const spendFile = arg("--spend-file");
  const results = await warmFreePlans({ base });
  // A request that did not hit the cache may have run the model even when it failed later: count it.
  const calls = results.filter((r) => !r.cached && r.status !== 0 && r.status !== 429).length;
  if (spendFile && calls > 0) {
    const day = new Date().toISOString().slice(0, 10);
    const usd = (calls * USD_PER_MISS).toFixed(2);
    appendFileSync(spendFile, `${day} | GLM 5.2 (Localley) | Push BM1 warm-free-plans cron: ${calls} preset free plan(s) regenerated | $${usd}\n`);
  }
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();

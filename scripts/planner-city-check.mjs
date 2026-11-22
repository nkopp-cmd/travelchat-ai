#!/usr/bin/env node
// Push CG4 (2026-11-22): daily live check that the default free plan builds in every enabled planner city.
// A 422 (no coverage) or 5xx in one city was invisible until a visitor hit it (CG1/CG2 found 12 of 15 cities failing).
// The default input is a preset (lib/trips/plan-cache isPresetPlanInput), so after the first build a city answers
// from the KV plan cache: no model cost per run. x-localley-check keeps these calls out of the visitor funnel.
// Usage: node scripts/planner-city-check.mjs [--push] [--base https://www.localley.io]
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const push = args.includes("--push");
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "https://www.localley.io";
// The generate route allows 5 requests a minute per client (rateLimiters.strict).
const GAP_MS = 13_000;
const NOTIFY = new URL("../../../shared/scripts/notify.sh", import.meta.url).pathname;

export const DEFAULT_PLAN = { days: 3, interests: [], budget: "moderate", localnessLevel: 3, pace: "moderate", groupType: "solo" };

export function summarize(results) {
  const failed = results.filter((r) => r.status !== 200);
  return { ok: failed.length === 0, failed, line: failed.map((r) => `${r.city} ${r.status}${r.reason ? ` ${r.reason}` : ""}`).join(", ") };
}

async function checkCity(city) {
  try {
    const res = await fetch(`${base}/api/itineraries/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-localley-check": "1", "user-agent": "localley-planner-city-check" },
      body: JSON.stringify({ city, ...DEFAULT_PLAN }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await res.json().catch(() => null);
    const reason = res.status === 200 ? "" : (typeof body?.error === "string" ? body.error : body?.error?.code) ?? "";
    return { city, status: res.status, reason };
  } catch (error) {
    return { city, status: 0, reason: error?.name ?? "fetch_error" };
  }
}

async function main() {
  const list = await fetch(`${base}/api/cities`, { headers: { "x-localley-check": "1" } }).then((r) => r.json());
  const cities = (list.cities ?? []).filter((c) => c.isEnabled).map((c) => c.name);
  if (cities.length === 0) throw new Error("no enabled cities from /api/cities");
  const results = [];
  for (const [i, city] of cities.entries()) {
    if (i > 0) await sleep(GAP_MS);
    results.push(await checkCity(city));
  }
  const { ok, failed, line } = summarize(results);
  console.log(JSON.stringify({ at: new Date().toISOString(), cities: cities.length, failed: failed.length, results }));
  if (!ok && push) {
    execFileSync(NOTIFY, [`Localley planner check: the default free plan fails in ${failed.length} of ${cities.length} cities: ${line}. Run: node scripts/planner-city-check.mjs`], { stdio: "inherit" });
  }
  process.exitCode = ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();

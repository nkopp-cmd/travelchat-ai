#!/usr/bin/env node
// CPU per route for the production Worker (Push DM1).
// Reads the newest fetch events from Workers Observability and prints, per route class:
// requests, share of total CPU, CPU p50/p90 ms, wall p50 ms and the share of verified-bot traffic.
// Usage: node scripts/perf/cpu-per-route.mjs [--minutes 60] [--limit 2000] [--json] [--max-p50 50]
// Needs CLOUDFLARE_API_TOKEN (Workers Observability read) in the environment or ~/secrets/keys.env.
// --max-p50 N: exit 1 when one of the top 3 routes by CPU share has CPU p50 > N ms.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "664f242340bcec2f32daaeee15f58bde";
const SCRIPT = process.env.WORKER_NAME || "localley-next";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  try {
    const line = readFileSync(`${homedir()}/secrets/keys.env`, "utf8")
      .split("\n")
      .find((l) => l.startsWith("CLOUDFLARE_API_TOKEN="));
    if (line) return line.slice("CLOUDFLARE_API_TOKEN=".length).replace(/^["']|["']$/g, "").trim();
  } catch {}
  throw new Error("CLOUDFLARE_API_TOKEN missing");
}

// Route classes: keep them coarse so slugs never split a route.
export function routeClass(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return "(bad url)";
  }
  const p = u.pathname;
  const rsc = u.searchParams.has("_rsc") ? " (rsc)" : "";
  const seg = p.split("/").filter(Boolean);
  if (seg.length === 0) return `/${rsc}`;
  if (seg[0] === "_next") return `/_next/${seg[1] ?? ""}`;
  if (seg[0] === "api") return `/api/${seg[1] ?? ""}`;
  if (seg[0] === "og") return `/og/${seg[1] ?? ""}`;
  if (/\.(xml|txt|ico|png|jpg|webp|avif|svg|json|webmanifest)$/.test(p)) return seg.length > 1 ? `/${seg[0]}/*.file` : p;
  if (seg.length === 1) return `/${seg[0]}${u.search && !rsc ? "?q" : ""}${rsc}`;
  return `/${seg[0]}/:x${seg.length > 2 ? "/..." : ""}${rsc}`;
}

export function pct(sorted, q) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];
}

export function summarize(events) {
  const groups = new Map();
  let total = 0;
  for (const e of events) {
    const w = e.$workers ?? {};
    if (w.eventType !== "fetch") continue;
    const url = w.event?.request?.url;
    const cpu = Number(w.cpuTimeMs ?? 0);
    const key = routeClass(url ?? "");
    const g = groups.get(key) ?? { route: key, n: 0, cpu: [], wall: [], bots: 0, cpuSum: 0 };
    g.n++;
    g.cpu.push(cpu);
    g.wall.push(Number(w.wallTimeMs ?? 0));
    g.cpuSum += cpu;
    if (w.event?.request?.cf?.verifiedBotCategory) g.bots++;
    groups.set(key, g);
    total += cpu;
  }
  return [...groups.values()]
    .map((g) => {
      g.cpu.sort((a, b) => a - b);
      g.wall.sort((a, b) => a - b);
      return {
        route: g.route,
        requests: g.n,
        cpuShare: total ? g.cpuSum / total : 0,
        cpuSumMs: g.cpuSum,
        cpuP50: pct(g.cpu, 0.5),
        cpuP90: pct(g.cpu, 0.9),
        wallP50: pct(g.wall, 0.5),
        botShare: g.bots / g.n,
      };
    })
    .sort((a, b) => b.cpuSumMs - a.cpuSumMs);
}

async function main() {
  const minutes = Number(arg("minutes", 60));
  const limit = Number(arg("limit", 2000));
  const maxP50 = arg("max-p50", null);
  const to = Date.now();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/observability/telemetry/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({
      queryId: "cpu-per-route",
      timeframe: { from: to - minutes * 60_000, to },
      view: "events",
      limit,
      parameters: {
        filters: [
          { key: "$metadata.service", operation: "eq", type: "string", value: SCRIPT },
          { key: "$workers.eventType", operation: "eq", type: "string", value: "fetch" },
        ],
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) {
    console.error(`observability query failed: HTTP ${res.status} ${JSON.stringify(body.errors ?? []).slice(0, 300)}`);
    process.exit(2);
  }
  const events = body.result?.events?.events ?? [];
  const rows = summarize(events);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ minutes, events: events.length, rows }));
  } else {
    console.log(`${SCRIPT}: ${events.length} fetch events, last ${minutes} min`);
    console.log("route".padEnd(34), "req".padStart(5), "cpu%".padStart(6), "p50".padStart(5), "p90".padStart(5), "wall50".padStart(7), "bot%".padStart(5));
    for (const r of rows.slice(0, 15)) {
      console.log(
        r.route.slice(0, 34).padEnd(34),
        String(r.requests).padStart(5),
        (r.cpuShare * 100).toFixed(1).padStart(6),
        String(r.cpuP50).padStart(5),
        String(r.cpuP90).padStart(5),
        String(r.wallP50).padStart(7),
        String(Math.round(r.botShare * 100)).padStart(5),
      );
    }
  }
  if (maxP50 != null) {
    const over = rows.slice(0, 3).filter((r) => r.cpuP50 > Number(maxP50));
    if (over.length) {
      console.error(`top-3 routes over ${maxP50} ms CPU p50: ${over.map((r) => `${r.route}=${r.cpuP50}`).join(", ")}`);
      process.exit(1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});

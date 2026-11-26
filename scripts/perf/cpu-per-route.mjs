#!/usr/bin/env node
// CPU per route for the production Worker (Push DM1).
// Reads the newest fetch events from Workers Observability and prints, per route class:
// requests, share of total CPU, CPU p50/p90 ms, wall p50 ms and the share of verified-bot traffic.
// Usage: node scripts/perf/cpu-per-route.mjs [--minutes 60] [--limit 2000] [--json] [--max-p50 50]
//        [--probe 10 --max-warm-p50 50] [--max-cpu-month 300]
// Needs CLOUDFLARE_API_TOKEN (Workers Observability + Analytics read) in the environment or ~/secrets/keys.env.
// --max-p50 N: exit 1 when one of the top 3 routes by CPU share has CPU p50 > N ms (all requests, cold isolates too).
// --probe N: send N back-to-back requests (cache-busting ?cpuprobe=) to one URL of each top-3 route, read their log
//   events and report the warm-isolate CPU p50 (the first probe per route is dropped as a possible cold start).
// --max-warm-p50 N: exit 1 when a probed route has warm CPU p50 > N ms.
// --max-cpu-month M: exit 1 when the last 24 h of Worker CPU, times 30, exceeds M million CPU-ms.
// Why warm + month (decision 2026-11-26, DM1): crawler traffic spreads ~400 distinct URLs/hour over ~40 colos, so
// most requests start a new isolate, and booting the OpenNext bundle (~180-450 ms CPU) is billed to the request.
// Three request-path fixes could not move that floor; the gate therefore checks our own render cost (warm) and
// the bill (month), and prints the all-request p50 for information.
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

export const PROBE_PARAM = "cpuprobe";

export function withProbe(rawUrl, run) {
  const u = new URL(rawUrl);
  u.searchParams.set(PROBE_PARAM, run);
  return u.toString();
}

function probeRun(rawUrl) {
  try {
    return new URL(rawUrl).searchParams.get(PROBE_PARAM);
  } catch {
    return null;
  }
}

function withoutProbe(rawUrl) {
  const u = new URL(rawUrl);
  u.searchParams.delete(PROBE_PARAM);
  return u.toString();
}

// One sample URL per top route: a GET that answered < 400, so the probe renders the same page the visitor got.
export function pickProbeUrls(events, routes) {
  const picked = new Map();
  for (const e of events) {
    const w = e.$workers ?? {};
    const url = w.event?.request?.url;
    const status = Number(w.event?.response?.status ?? 0);
    if (!url || w.event?.request?.method !== "GET" || !status || status >= 400 || probeRun(url)) continue;
    const route = routeClass(url);
    if (routes.includes(route) && !picked.has(route)) picked.set(route, withoutProbe(url));
  }
  return picked;
}

// Warm CPU p50 per route from the probe events of one run: drop the earliest event (possible cold isolate).
export function warmSummary(events, run) {
  const groups = new Map();
  for (const e of events) {
    const w = e.$workers ?? {};
    const url = w.event?.request?.url;
    if (!url || probeRun(url) !== run) continue;
    const route = routeClass(withoutProbe(url));
    const list = groups.get(route) ?? [];
    list.push({ t: Number(e.timestamp ?? 0), cpu: Number(w.cpuTimeMs ?? 0) });
    groups.set(route, list);
  }
  return [...groups.entries()].map(([route, list]) => {
    list.sort((a, b) => a.t - b.t);
    const warm = list.slice(1).map((x) => x.cpu).sort((a, b) => a - b);
    return { route, probes: list.length, firstCpu: list[0]?.cpu ?? 0, warmP50: pct(warm, 0.5) };
  });
}

export function projectMonth(cpuUs24h) {
  return (cpuUs24h / 1000) * 30;
}

async function queryEvents(from, to, limit) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/observability/telemetry/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({
      queryId: "cpu-per-route",
      timeframe: { from, to },
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
  return body.result?.events?.events ?? [];
}

async function cpuUsLast24h() {
  const to = new Date();
  const from = new Date(to.getTime() - 86_400_000);
  const query = `{viewer{accounts(filter:{accountTag:"${ACCOUNT}"}){workersInvocationsAdaptive(limit:10,filter:{scriptName:"${SCRIPT}",datetime_geq:"${from.toISOString()}",datetime_leq:"${to.toISOString()}"}){sum{requests cpuTimeUs}}}}}`;
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json().catch(() => ({}));
  const rows = body.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  if (!res.ok || !rows) throw new Error(`analytics query failed: HTTP ${res.status} ${JSON.stringify(body.errors ?? []).slice(0, 300)}`);
  return rows.reduce((acc, r) => ({ requests: acc.requests + r.sum.requests, cpuUs: acc.cpuUs + r.sum.cpuTimeUs }), { requests: 0, cpuUs: 0 });
}

async function probe(urls, n) {
  const run = Date.now().toString(36);
  const start = Date.now() - 5_000;
  for (const url of urls.values()) {
    for (let i = 0; i < n; i++) {
      const res = await fetch(withProbe(url, run), { headers: { "user-agent": "localley-cpu-probe" }, redirect: "manual" });
      await res.arrayBuffer().catch(() => null);
    }
  }
  // Log events arrive within about a minute: re-read until every route has its probes (max ~2 min).
  let summary = [];
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, 15_000));
    summary = warmSummary(await queryEvents(start, Date.now(), 2000), run);
    if (summary.length === urls.size && summary.every((s) => s.probes >= n - 1)) break;
  }
  return summary;
}

async function main() {
  const minutes = Number(arg("minutes", 60));
  const limit = Number(arg("limit", 2000));
  const maxP50 = arg("max-p50", null);
  const probeN = Number(arg("probe", 0));
  const maxWarm = arg("max-warm-p50", null);
  const maxMonth = arg("max-cpu-month", null);
  const to = Date.now();
  const all = await queryEvents(to - minutes * 60_000, to, limit);
  const events = all.filter((e) => !probeRun(e.$workers?.event?.request?.url ?? ""));
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
  let failed = false;
  if (maxP50 != null) {
    const over = rows.slice(0, 3).filter((r) => r.cpuP50 > Number(maxP50));
    if (over.length) {
      console.error(`top-3 routes over ${maxP50} ms CPU p50: ${over.map((r) => `${r.route}=${r.cpuP50}`).join(", ")}`);
      failed = true;
    }
  }
  if (probeN > 1) {
    const urls = pickProbeUrls(events, rows.slice(0, 3).map((r) => r.route));
    const warm = await probe(urls, probeN);
    console.log(`warm probe (${probeN} requests per route, first dropped):`);
    for (const w of warm) console.log(`  ${w.route.padEnd(30)} probes ${w.probes}  first ${w.firstCpu} ms  warm p50 ${w.warmP50} ms`);
    const missing = [...urls.keys()].filter((r) => !warm.some((w) => w.route === r && w.probes >= 2));
    if (maxWarm != null) {
      const over = warm.filter((w) => w.warmP50 > Number(maxWarm));
      if (over.length || missing.length) {
        console.error(`warm CPU p50 over ${maxWarm} ms: ${over.map((w) => `${w.route}=${w.warmP50}`).join(", ")}${missing.length ? ` no probe events: ${missing.join(", ")}` : ""}`);
        failed = true;
      }
    }
  }
  if (maxMonth != null) {
    const day = await cpuUsLast24h();
    const month = projectMonth(day.cpuUs);
    console.log(`last 24 h: ${day.requests} requests, ${Math.round(day.cpuUs / 1e6)} CPU-s -> ${(month / 1e6).toFixed(0)} M CPU-ms/month (budget ${maxMonth} M)`);
    if (month > Number(maxMonth) * 1e6) {
      console.error(`monthly CPU projection ${(month / 1e6).toFixed(0)} M CPU-ms over budget ${maxMonth} M`);
      failed = true;
    }
  }
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => {
  console.error(e.message);
  process.exit(2);
});

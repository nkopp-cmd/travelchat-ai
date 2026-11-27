// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createAuthTestDatabase } from "../helpers/d1-sqlite";
import { DAILY_LIMIT, MAX_BATCH, parseSpotEvents, recordSpotEvents, type SpotEventDatabase } from "@/lib/spot-event-store";
import { isPublicRoute } from "@/middleware";

vi.mock("server-only", () => ({}));

const day = new Date("2026-10-23T08:00:00Z");
const rowsOf = (db: ReturnType<typeof createAuthTestDatabase>) =>
  db.sqlite.prepare("SELECT day, event, spotId, count FROM spot_card_events_daily ORDER BY event, spotId").all();

describe("spot event parsing", () => {
  it("merges duplicates and keeps only public catalog ids and known events", () => {
    expect(parseSpotEvents({ events: [
      { event: "card_view", spot_id: "a" }, { event: "card_view", spot_id: "a" }, { event: "save", spot_id: "b" },
    ] })).toEqual([{ event: "card_view", spotId: "a", count: 2 }, { event: "save", spotId: "b", count: 1 }]);
  });

  it("refuses unknown events, URL-shaped ids, empty and oversized batches", () => {
    expect(parseSpotEvents({ events: [{ event: "purchase", spot_id: "a" }] })).toBeNull();
    expect(parseSpotEvents({ events: [{ event: "save", spot_id: "https://x.test/?email=a" }] })).toBeNull();
    expect(parseSpotEvents({ events: [] })).toBeNull();
    expect(parseSpotEvents({ events: Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ event: "save", spot_id: `s${i}` })) })).toBeNull();
    expect(parseSpotEvents("nope")).toBeNull();
  });
});

describe("spot event D1 store (real migration)", () => {
  it("adds daily counts per event and spot", async () => {
    const db = createAuthTestDatabase();
    expect(await recordSpotEvents([{ event: "card_view", spotId: "a", count: 2 }], db as unknown as SpotEventDatabase, day)).toBe("stored");
    expect(await recordSpotEvents([{ event: "card_view", spotId: "a", count: 1 }, { event: "directions", spotId: "a", count: 1 }], db as unknown as SpotEventDatabase, day)).toBe("stored");
    expect(rowsOf(db)).toEqual([
      { day: "2026-10-23", event: "card_view", spotId: "a", count: 3 },
      { day: "2026-10-23", event: "directions", spotId: "a", count: 1 },
    ]);
  });

  it("stops storing at the daily ceiling and starts again the next UTC day", async () => {
    const db = createAuthTestDatabase();
    db.sqlite.prepare("INSERT INTO spot_card_events_budget (day, total) VALUES (?, ?)").run("2026-10-23", DAILY_LIMIT - 1);
    const store = db as unknown as SpotEventDatabase;
    expect(await recordSpotEvents([{ event: "save", spotId: "a", count: 2 }], store, day)).toBe("limited");
    expect(rowsOf(db)).toEqual([]);
    expect(await recordSpotEvents([{ event: "save", spotId: "a", count: 1 }], store, day)).toBe("stored");
    expect(await recordSpotEvents([{ event: "save", spotId: "a", count: 1 }], store, new Date("2026-10-24T00:00:01Z"))).toBe("stored");
  });

  it("reports unavailable without a database or on a D1 error", async () => {
    expect(await recordSpotEvents([{ event: "save", spotId: "a", count: 1 }], undefined, day)).toBe("unavailable");
    const broken = { prepare: () => { throw new Error("D1 down"); }, batch: async () => [] } as unknown as SpotEventDatabase;
    expect(await recordSpotEvents([{ event: "save", spotId: "a", count: 1 }], broken, day)).toBe("unavailable");
  });
});

describe("collector route", () => {
  const post = (body: string, origin = "https://www.localley.io") => new NextRequest("https://www.localley.io/api/events/spots", {
    method: "POST", body, headers: { origin, "content-type": "application/json" },
  });

  it("is public, refuses other origins and bad bodies, and answers 204 for valid batches", async () => {
    const { POST } = await import("@/app/api/events/spots/route");
    expect(isPublicRoute(new NextRequest("https://www.localley.io/api/events/spots", { method: "POST" }))).toBe(true);
    expect((await POST(post('{"events":[{"event":"save","spot_id":"a"}]}', "https://evil.test"))).status).toBe(403);
    expect((await POST(post("not json"))).status).toBe(400);
    expect((await POST(post("x".repeat(5000)))).status).toBe(413);
    const ok = await POST(post('{"events":[{"event":"save","spot_id":"a"}]}'));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("x-localley-events")).toBe("unavailable");
  });
});

describe("planner funnel", () => {
  it("accepts browser steps with coarse sources, never the paid step or the stripe source", async () => {
    const { parseFunnelSteps } = await import("@/lib/spot-event-store");
    expect(parseFunnelSteps({ funnel: [{ step: "planner_start", source: "home" }, { step: "planner_start", source: "home" }] }))
      .toEqual([{ step: "planner_start", source: "home", count: 2 }]);
    expect(parseFunnelSteps({ funnel: [{ step: "checkout_paid", source: "preview" }] })).toBeNull();
    expect(parseFunnelSteps({ funnel: [{ step: "checkout_start", source: "stripe" }] })).toBeNull();
    expect(parseFunnelSteps({ funnel: [{ step: "planner_start", source: "https://x.test" }] })).toBeNull();
  });

  it("stores daily step counts with the real migration and shares the daily ceiling", async () => {
    const { recordFunnelSteps } = await import("@/lib/spot-event-store");
    const db = createAuthTestDatabase();
    const store = db as unknown as SpotEventDatabase;
    expect(await recordFunnelSteps([{ step: "planner_start", source: "home", count: 1 }], store, day)).toBe("stored");
    expect(await recordFunnelSteps([{ step: "checkout_paid", source: "stripe", count: 1 }], store, day)).toBe("stored");
    expect(await recordFunnelSteps([{ step: "planner_start", source: "home", count: 1 }], store, day)).toBe("stored");
    expect(db.sqlite.prepare("SELECT step, source, count FROM funnel_events_daily ORDER BY step").all()).toEqual([
      { step: "checkout_paid", source: "stripe", count: 1 }, { step: "planner_start", source: "home", count: 2 },
    ]);
    db.sqlite.prepare("UPDATE spot_card_events_budget SET total = ?").run(DAILY_LIMIT);
    expect(await recordFunnelSteps([{ step: "trip_generated", source: "direct", count: 1 }], store, day)).toBe("limited");
  });

  // Push BH3: the Generate click step. Migration 0007 rebuilds the table with the widened CHECK and keeps the old
  // rows (and the old table as funnel_events_daily_old for rollback).
  it("accepts and stores plan_requested after migration 0007, with old rows kept", async () => {
    const { parseFunnelSteps, recordFunnelSteps } = await import("@/lib/spot-event-store");
    expect(parseFunnelSteps({ funnel: [{ step: "plan_requested", source: "home" }] }))
      .toEqual([{ step: "plan_requested", source: "home", count: 1 }]);
    const db = createAuthTestDatabase();
    const store = db as unknown as SpotEventDatabase;
    expect(await recordFunnelSteps([{ step: "planner_start", source: "home", count: 1 }, { step: "plan_requested", source: "home", count: 1 }], store, day)).toBe("stored");
    expect(db.sqlite.prepare("SELECT step, source, count FROM funnel_events_daily ORDER BY step").all()).toEqual([
      { step: "plan_requested", source: "home", count: 1 }, { step: "planner_start", source: "home", count: 1 },
    ]);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM funnel_events_daily_old").get()).toEqual({ n: 0 });
    expect(() => db.sqlite.prepare("INSERT INTO funnel_events_daily VALUES ('2026-10-23', 'made_up', 'home', 1)").run()).toThrow(/CHECK/);
  });

  it("migration 0007 copies every existing funnel row into the rebuilt table", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const path = await import("node:path");
    const { DatabaseSync } = await import("node:sqlite");
    const dir = path.resolve(__dirname, "../../migrations/auth");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const sqlite = new DatabaseSync(":memory:");
    for (const name of files.filter((f) => f < "0007")) sqlite.exec(readFileSync(path.join(dir, name), "utf8"));
    sqlite.exec("INSERT INTO funnel_events_daily VALUES ('2026-11-20', 'planner_start', 'home', 7), ('2026-11-21', 'checkout_paid', 'stripe', 1)");
    sqlite.exec(readFileSync(path.join(dir, "0007_funnel_plan_requested.sql"), "utf8"));
    const rows = "SELECT day, step, source, count FROM %s ORDER BY day";
    expect(sqlite.prepare(rows.replace("%s", "funnel_events_daily")).all()).toEqual(sqlite.prepare(rows.replace("%s", "funnel_events_daily_old")).all());
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM funnel_events_daily").get()).toEqual({ n: 2 });
  });

  it("route accepts a funnel beacon and refuses a forged paid step", async () => {
    const { POST } = await import("@/app/api/events/spots/route");
    const send = (body: unknown) => POST(new NextRequest("https://www.localley.io/api/events/spots", {
      method: "POST", body: JSON.stringify(body), headers: { origin: "https://www.localley.io" },
    }));
    expect((await send({ funnel: [{ step: "preview_view", source: "preview" }] })).status).toBe(204);
    expect((await send({ funnel: [{ step: "checkout_paid", source: "stripe" }] })).status).toBe(400);
  });
  // Push AE3: the money step end to end. The wizard's beacon body (lib/funnel-analytics.ts trackFunnelStep)
  // reaches the route, the route finds AUTH_DB in the Cloudflare context and a funnel_events_daily row exists.
  it("route stores the wizard's trip_generated beacon in funnel_events_daily", async () => {
    const { POST } = await import("@/app/api/events/spots/route");
    const db = createAuthTestDatabase();
    const key = Symbol.for("__cloudflare-context__");
    const global = globalThis as Record<symbol, unknown>;
    const before = global[key];
    global[key] = { env: { AUTH_DB: db } };
    try {
      const beacon = JSON.stringify({ funnel: [{ step: "trip_generated", source: "direct" }] });
      const send = () => POST(new NextRequest("https://www.localley.io/api/events/spots", {
        method: "POST", body: beacon, headers: { origin: "https://www.localley.io", "content-type": "application/json" },
      }));
      const first = await send();
      expect(first.status).toBe(204);
      expect(first.headers.get("x-localley-events")).toBe("stored");
      await send();
      expect(db.sqlite.prepare("SELECT step, source, count FROM funnel_events_daily").all())
        .toEqual([{ step: "trip_generated", source: "direct", count: 2 }]);
      expect(db.sqlite.prepare("SELECT SUM(total) AS total FROM spot_card_events_budget").get()).toEqual({ total: 2 });
    } finally {
      global[key] = before;
    }
  });
});

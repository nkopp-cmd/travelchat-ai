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

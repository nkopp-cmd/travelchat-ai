// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), reader: vi.fn(), insert: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ from: () => ({ insert: mocks.insert }) }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimiters: { relaxed: mocks.limit } }));
import { GET, POST } from "@/app/api/affiliates/track/route";
import { parseAffiliateClick } from "@/lib/affiliate-click";
const original = process.env;
let db: D1Sqlite;
const host = "localley-next-preview.nkopp.workers.dev";
const click = { partner: "viator", trackingId: "viator-12345P1", eventType: "click",
  activityName: "Night market walk", url: "https://www.viator.com/tours/x" };
const post = (value: unknown, hostname = host, candidate = true) => new NextRequest(
  `https://${hostname}/api/affiliates/track${candidate ? "?data_candidate=d1" : ""}`,
  { method: "POST", body: typeof value === "string" ? value : JSON.stringify(value),
    headers: { "cf-connecting-ip": "203.0.113.9", "user-agent": "vitest" } });
const rows = () => db.sqlite.prepare(`SELECT ownerId, partner, trackingId, eventType, activityName, affiliateUrl,
  userAgent FROM preview_affiliate_clicks ORDER BY createdAtMs, rowid`).all();
beforeEach(() => {
  vi.clearAllMocks(); process.env = { ...original, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys=ON; CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT);`);
  db.sqlite.exec(readFileSync("migrations/app-preview/0033_preview_affiliate_clicks.sql", "utf8"));
  mocks.reader.mockReturnValue(db); mocks.insert.mockResolvedValue({ error: null });
  mocks.limit.mockResolvedValue(null); mocks.auth.mockResolvedValue({ userId: "owner-a" });
});
afterEach(() => { process.env = original; db.sqlite.close(); });

describe("affiliate click validation", () => {
  it("accepts known partners and events, trims names and rejects bad fields", () => {
    expect(parseAffiliateClick({ ...click, activityName: "x".repeat(300) })?.activityName).toHaveLength(200);
    expect(parseAffiliateClick({ partner: "klook", trackingId: "k-1", eventType: "view" }))
      .toEqual({ partner: "klook", trackingId: "k-1", eventType: "view", activityName: null, affiliateUrl: null });
    for (const bad of [{ ...click, partner: "evil" }, { ...click, trackingId: undefined },
      { ...click, trackingId: "a b" }, { ...click, trackingId: "t".repeat(121) }, { ...click, eventType: "buy" },
      { ...click, url: "javascript:alert(1)" }, { ...click, url: `https://x.test/${"u".repeat(2048)}` },
      { ...click, activityName: 7 }]) expect(parseAffiliateClick(bad)).toBeNull();
  });
});

describe("isolated D1 affiliate clicks on the exact candidate", () => {
  it("appends one owner-scoped row per click and never touches Source", async () => {
    for (let i = 0; i < 2; i++) {
      const res = await POST(post(click));
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    }
    mocks.auth.mockResolvedValue({ userId: "owner-b" });
    await POST(post({ ...click, trackingId: "b-1", url: undefined }));
    expect(rows()).toEqual([
      { ownerId: "auth:owner-a", partner: "viator", trackingId: "viator-12345P1", eventType: "click",
        activityName: "Night market walk", affiliateUrl: "https://www.viator.com/tours/x", userAgent: "vitest" },
      { ownerId: "auth:owner-a", partner: "viator", trackingId: "viator-12345P1", eventType: "click",
        activityName: "Night market walk", affiliateUrl: "https://www.viator.com/tours/x", userAgent: "vitest" },
      { ownerId: "auth:owner-b", partner: "viator", trackingId: "b-1", eventType: "click",
        activityName: "Night market walk", affiliateUrl: null, userAgent: "vitest" }]);
    const ipHash = db.sqlite.prepare("SELECT DISTINCT ipHash FROM preview_affiliate_clicks").all();
    expect(JSON.stringify(ipHash)).not.toContain("203.0.113.9");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("refuses signed-out and invalid candidate writes", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(post(click))).status).toBe(401);
    mocks.auth.mockResolvedValue({ userId: "owner-a" });
    expect((await POST(post("{not json"))).status).toBe(400);
    expect((await POST(post({ ...click, partner: "evil" }))).status).toBe(400);
    expect(rows()).toEqual([]);
  });

  it("records the pixel for a signed-in owner and still returns the gif", async () => {
    const res = await GET(new NextRequest(`https://${host}/api/affiliates/track?data_candidate=d1&partner=booking&tid=bk-9`));
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(res.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(rows()).toMatchObject([{ ownerId: "auth:owner-a", partner: "booking", trackingId: "bk-9", eventType: "view" }]);
    const bad = await GET(new NextRequest(`https://${host}/api/affiliates/track?data_candidate=d1&partner=evil&tid=x`));
    expect(bad.headers.get("Content-Type")).toBe("image/gif");
    expect(rows()).toHaveLength(1);
  });
});

describe("current site", () => {
  it("keeps the Source table off the candidate host or flag", async () => {
    for (const req of [post(click, "www.localley.io"), post(click, host, false)]) {
      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Localley-Data-Source")).toBeNull();
    }
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ clerk_user_id: "owner-a", partner: "viator",
      tracking_id: "viator-12345P1", event_type: "click", activity_name: "Night market walk" });
    expect(mocks.insert.mock.calls[0][0].ip_hash).not.toContain("203.0.113.9");
    expect(rows()).toEqual([]);
  });

  it("rejects invalid fields before any write and honours the rate limit", async () => {
    expect((await POST(post({ ...click, trackingId: undefined }, "www.localley.io"))).status).toBe(400);
    mocks.limit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await POST(post(click, "www.localley.io"))).status).toBe(429);
    expect((await GET(new NextRequest("https://www.localley.io/api/affiliates/track?partner=viator&tid=v-1"))).status).toBe(429);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

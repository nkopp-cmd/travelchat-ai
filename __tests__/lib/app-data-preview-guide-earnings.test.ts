// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewGuideEarningsCandidate, parseEarningsMonths,
  previewGuideEarnings, PreviewGuideNotApproved } from "@/lib/app-data/preview-guide-earnings";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0015_preview_guide_profiles.sql"), "utf8"));
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0018_preview_guide_revenue.sql"), "utf8"));
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0019_preview_earning_approvals.sql"), "utf8"));
  mocks.reader.mockReturnValue(db);
  return db;
}
function guide(db: D1Sqlite, owner = "owner-1", status = "approved") {
  const payload = { id: `guide-${owner}`, clerk_user_id: owner, status,
    applied_at: "2026-09-30T01:00:00Z", stripe_account_id: null };
  db.sqlite.prepare("UPDATE legacy_guide_profile_batches SET sourceCount = sourceCount + 1").run();
  db.sqlite.prepare("INSERT INTO legacy_guide_profiles VALUES (?, ?, ?, ?, ?, ?)")
    .run(payload.id, "source-20260929", owner, status, payload.applied_at, JSON.stringify(payload));
}
function earning(db: D1Sqlite, id: string, owner: string, earningMonth: string, status: string, amount: number) {
  const payload = { id, guide_clerk_user_id: owner, earning_month: earningMonth, status, gross_amount: amount };
  db.sqlite.prepare("UPDATE legacy_guide_revenue_batches SET earningsCount = earningsCount + 1").run();
  db.sqlite.prepare("INSERT INTO legacy_guide_earnings VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, "source-20260930", owner, earningMonth, status, String(amount), JSON.stringify(payload));
}
function engagement(db: D1Sqlite, id: string, owner: string, kind: string, points: number, engagementMonth = "2026-09-01") {
  const payload = { id, creator_clerk_user_id: owner, engagement_month: engagementMonth,
    content_type: kind, engagement_points: points };
  db.sqlite.prepare("UPDATE legacy_guide_revenue_batches SET engagementCount = engagementCount + 1").run();
  db.sqlite.prepare("INSERT INTO legacy_content_engagement VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, "source-20260930", owner, engagementMonth, kind, points, JSON.stringify(payload));
}

describe("preview guide earnings", () => {
  it("requires the exact host, flag and isolated preview", () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/connect/earnings${flag ? "?data_candidate=d1" : ""}`);
    expect(isPreviewGuideEarningsCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewGuideEarningsCandidate(request("www.localley.io"))).toBe(false);
    expect(isPreviewGuideEarningsCandidate(request("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    process.env.AUTH_MAIL_MODE = "binding";
    expect(isPreviewGuideEarningsCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("bounds requested history months", () => {
    expect(parseEarningsMonths(null)).toBe(6);
    expect(parseEarningsMonths("24")).toBe(24);
    for (const bad of ["0", "25", "-1", "6junk", "01", ""]) expect(parseEarningsMonths(bad)).toBeNull();
  });

  it("returns exact-owner earnings, full summary and current engagement", async () => {
    const db = database();
    guide(db);
    guide(db, "owner-2");
    earning(db, "earn-1", "owner-1", "2026-09-01", "calculated", 5);
    earning(db, "earn-2", "owner-1", "2026-08-01", "paid", 10);
    earning(db, "earn-3", "owner-1", "2026-07-01", "failed", 2);
    engagement(db, "eng-1", "owner-1", "itinerary_view", 1);
    engagement(db, "eng-2", "owner-1", "spot_save", 2);
    engagement(db, "eng-3", "owner-2", "spot_view", 1);
    const result = await previewGuideEarnings("owner-1", 2, new Date("2026-09-30T12:00:00Z"));
    expect(result.summary).toEqual({ totalEarned: 15, totalPaidOut: 10, pendingBalance: 5 });
    expect(result.earnings.map(row => row.id)).toEqual(["earn-1", "earn-2"]);
    expect(result.currentMonth).toEqual({ totalPoints: 3, itineraryViews: 1, itinerarySaves: 0,
      spotViews: 0, spotSaves: 1 });
    expect(await previewGuideEarnings("owner-2", 2, new Date("2026-09-30T12:00:00Z")))
      .toMatchObject({ summary: { totalEarned: 0 }, earnings: [], currentMonth: { totalPoints: 1 } });
  });

  it("denies missing or unapproved guides before revenue access", async () => {
    const db = database();
    guide(db, "owner-1", "pending");
    await expect(previewGuideEarnings("owner-1", 6)).rejects.toBeInstanceOf(PreviewGuideNotApproved);
    await expect(previewGuideEarnings("other-owner", 6)).rejects.toBeInstanceOf(PreviewGuideNotApproved);
  });

  it("accepts equivalent numeric money formatting from the source", async () => {
    const db = database();
    guide(db);
    earning(db, "earn-1", "owner-1", "2026-09-01", "paid", 10);
    db.sqlite.prepare("UPDATE legacy_guide_earnings SET grossAmount = '10.00'").run();
    const result = await previewGuideEarnings("owner-1", 6, new Date("2026-09-30T12:00:00Z"));
    expect(result.summary.totalPaidOut).toBe(10);
  });

  it("fails closed on missing, partial and malformed revenue archives", async () => {
    const db = database();
    guide(db);
    db.sqlite.prepare("DELETE FROM legacy_guide_revenue_batches").run();
    await expect(previewGuideEarnings("owner-1", 6)).rejects.toThrow("archive unavailable");
    db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0018_preview_guide_revenue.sql"), "utf8"));
    db.sqlite.prepare("UPDATE legacy_guide_revenue_batches SET earningsCount = 1").run();
    await expect(previewGuideEarnings("owner-1", 6)).rejects.toThrow("count mismatch");
    db.sqlite.prepare("UPDATE legacy_guide_revenue_batches SET earningsCount = 0").run();
    earning(db, "earn-1", "owner-1", "2026-09-01", "paid", 10);
    db.sqlite.prepare("UPDATE legacy_guide_earnings SET payload = ?").run(JSON.stringify({
      id: "earn-1", guide_clerk_user_id: "other-owner", earning_month: "2026-09-01",
      status: "paid", gross_amount: 10,
    }));
    await expect(previewGuideEarnings("owner-1", 6)).rejects.toThrow("payload mismatch");
  });

  it("rejects malformed engagement payloads", async () => {
    const db = database();
    guide(db);
    engagement(db, "eng-1", "owner-1", "spot_view", 1);
    db.sqlite.prepare("UPDATE legacy_content_engagement SET payload = ?").run(JSON.stringify({
      id: "eng-1", creator_clerk_user_id: "other-owner", engagement_month: "2026-09-01",
      content_type: "spot_view", engagement_points: 1,
    }));
    await expect(previewGuideEarnings("owner-1", 6, new Date("2026-09-30T12:00:00Z")))
      .rejects.toThrow("payload mismatch");
  });
});

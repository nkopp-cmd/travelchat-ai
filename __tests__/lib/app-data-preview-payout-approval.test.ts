// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { approvePreviewPayouts, isPreviewPayoutApprovalCandidate,
  parsePayoutApproval, PreviewPayoutMissing } from "@/lib/app-data/preview-payout-approval";
import { previewGuideEarnings } from "@/lib/app-data/preview-guide-earnings";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });
function database() {
  const db = new D1Sqlite();
  for (const file of ["0015_preview_guide_profiles.sql", "0018_preview_guide_revenue.sql",
    "0019_preview_earning_approvals.sql"]) {
    db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview", file), "utf8"));
  }
  mocks.reader.mockReturnValue(db);
  return db;
}
function guide(db: D1Sqlite, owner: string, status = "approved") {
  const payload = { id: `guide-${owner}`, clerk_user_id: owner, status, applied_at: "2026-09-30T01:00:00Z" };
  db.sqlite.prepare("UPDATE legacy_guide_profile_batches SET sourceCount = sourceCount + 1").run();
  db.sqlite.prepare("INSERT INTO legacy_guide_profiles VALUES (?, ?, ?, ?, ?, ?)")
    .run(payload.id, "source-20260929", owner, status, payload.applied_at, JSON.stringify(payload));
}
function earning(db: D1Sqlite, id: string, owner: string, earningMonth: string, status = "calculated") {
  const payload = { id, guide_clerk_user_id: owner, earning_month: earningMonth, status, gross_amount: 10 };
  db.sqlite.prepare("UPDATE legacy_guide_revenue_batches SET earningsCount = earningsCount + 1").run();
  db.sqlite.prepare("INSERT INTO legacy_guide_earnings VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, "source-20260930", owner, earningMonth, status, "10.00", JSON.stringify(payload));
}
const admin = "user_38VRkLQbwVNbAqR9lBXTMGXr54h";
const otherAdmin = "eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx";

describe("preview payout approval", () => {
  it("requires the isolated host and exact candidate query", () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const req = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/admin/payouts/approve${flag ? "?data_candidate=d1" : ""}`);
    expect(isPreviewPayoutApprovalCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewPayoutApprovalCandidate(req("www.localley.io"))).toBe(false);
    expect(isPreviewPayoutApprovalCandidate(req("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    process.env.AUTH_MAIL_MODE = "cloudflare";
    expect(isPreviewPayoutApprovalCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("bounds exact month or unique IDs", () => {
    expect(parsePayoutApproval({ month: "2026-09-01" })).toEqual({ month: "2026-09-01" });
    expect(parsePayoutApproval({ earningIds: ["earn-1"] })).toEqual({ earningIds: ["earn-1"] });
    for (const body of [{}, { month: "2026-09-02" }, { month: "2026-09-01", earningIds: ["earn-1"] },
      { earningIds: [] }, { earningIds: ["earn-1", "earn-1"] },
      { earningIds: Array.from({ length: 101 }, (_, i) => `earn-${i}`) }, { month: "2026-09-01", extra: true }]) {
      expect(parsePayoutApproval(body)).toBeNull();
    }
  });

  it("approves one month once, keeps source immutable, and updates candidate earnings", async () => {
    const db = database();
    guide(db, "owner-1"); guide(db, "owner-2");
    earning(db, "earn-1", "owner-1", "2026-09-01");
    earning(db, "earn-2", "owner-1", "2026-08-01");
    earning(db, "earn-3", "owner-2", "2026-09-01");
    expect(await approvePreviewPayouts({ month: "2026-09-01" }, admin)).toBe(2);
    expect(await approvePreviewPayouts({ month: "2026-09-01" }, otherAdmin)).toBe(0);
    const rows = db.sqlite.prepare("SELECT earningId, approvedBy FROM preview_earning_approvals ORDER BY earningId").all();
    expect(rows).toEqual([{ earningId: "earn-1", approvedBy: admin }, { earningId: "earn-3", approvedBy: admin }]);
    expect(db.sqlite.prepare("SELECT status FROM legacy_guide_earnings WHERE id = 'earn-1'").get())
      .toEqual({ status: "calculated" });
    const owner = await previewGuideEarnings("owner-1", 2, new Date("2026-09-30T12:00:00Z"));
    expect(owner.earnings.map(row => row.status)).toEqual(["approved", "calculated"]);
    expect(owner.summary.pendingBalance).toBe(20);
    expect((await previewGuideEarnings("owner-2", 2, new Date("2026-09-30T12:00:00Z"))).earnings[0].status)
      .toBe("approved");
  });

  it("selects only exact IDs and refuses missing IDs without a partial write", async () => {
    const db = database(); guide(db, "owner-1");
    earning(db, "earn-1", "owner-1", "2026-09-01");
    earning(db, "earn-2", "owner-1", "2026-08-01", "paid");
    await expect(approvePreviewPayouts({ earningIds: ["earn-1", "absent"] }, admin))
      .rejects.toBeInstanceOf(PreviewPayoutMissing);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_earning_approvals").get()).toEqual({ n: 0 });
    expect(await approvePreviewPayouts({ earningIds: ["earn-2"] }, admin)).toBe(0);
    expect(await approvePreviewPayouts({ earningIds: ["earn-1"] }, admin)).toBe(1);
  });

  it("fails closed if an approved source earning later changes status", async () => {
    const db = database(); guide(db, "owner-1");
    earning(db, "earn-1", "owner-1", "2026-09-01");
    expect(await approvePreviewPayouts({ earningIds: ["earn-1"] }, admin)).toBe(1);
    db.sqlite.prepare("UPDATE legacy_guide_earnings SET status = 'paid', payload = ? WHERE id = 'earn-1'")
      .run(JSON.stringify({ id: "earn-1", guide_clerk_user_id: "owner-1", earning_month: "2026-09-01",
        status: "paid", gross_amount: 10 }));
    await expect(previewGuideEarnings("owner-1", 6, new Date("2026-09-30T12:00:00Z")))
      .rejects.toThrow("approval overlay");
  });

  it("does not approve a stale batch after a newer import arrives", async () => {
    const db = database(); guide(db, "owner-1");
    earning(db, "earn-1", "owner-1", "2026-09-01");
    const prepare = db.prepare.bind(db);
    mocks.reader.mockReturnValue({ prepare(sql: string) {
      const statement = prepare(sql);
      if (!sql.startsWith("INSERT OR IGNORE INTO preview_earning_approvals")) return statement;
      return { bind(...values: (string | number | null)[]) {
        const bound = statement.bind(...values);
        return { run: async () => {
          db.sqlite.prepare(`INSERT INTO legacy_guide_revenue_batches
            (id, earningsCount, engagementCount, earningsSha256, engagementSha256, importedAt)
            SELECT 'newer', 0, 0, earningsSha256, engagementSha256, '2026-10-01T00:00:00Z'
            FROM legacy_guide_revenue_batches WHERE id = 'source-20260930'`).run();
          return bound.run();
        } };
      } };
    } });
    await expect(approvePreviewPayouts({ earningIds: ["earn-1"] }, admin))
      .rejects.toThrow("source changed");
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_earning_approvals").get()).toEqual({ n: 0 });
  });

  it("refuses partial or malformed archives and unapproved guide owners", async () => {
    const db = database(); guide(db, "owner-1", "rejected");
    earning(db, "earn-1", "owner-1", "2026-09-01");
    await expect(approvePreviewPayouts({ month: "2026-09-01" }, admin)).rejects.toThrow("guide unavailable");
    db.sqlite.prepare("UPDATE legacy_guide_profiles SET status = 'approved', payload = ?")
      .run(JSON.stringify({ id: "guide-owner-1", clerk_user_id: "owner-1", status: "approved", applied_at: "2026-09-30T01:00:00Z" }));
    db.sqlite.prepare("UPDATE legacy_guide_revenue_batches SET earningsCount = 2").run();
    await expect(approvePreviewPayouts({ month: "2026-09-01" }, admin)).rejects.toThrow("count mismatch");
    db.sqlite.prepare("UPDATE legacy_guide_revenue_batches SET earningsCount = 1").run();
    db.sqlite.prepare("UPDATE legacy_guide_earnings SET payload = ?").run(JSON.stringify({
      id: "earn-1", guide_clerk_user_id: "other", earning_month: "2026-09-01", status: "calculated", gross_amount: 10,
    }));
    await expect(approvePreviewPayouts({ month: "2026-09-01" }, admin)).rejects.toThrow("payload mismatch");
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_earning_approvals").get()).toEqual({ n: 0 });
  });
});

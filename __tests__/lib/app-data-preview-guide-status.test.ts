// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewGuideStatusCandidate, previewGuideStatus } from "@/lib/app-data/preview-guide-status";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0015_preview_guide_profiles.sql"), "utf8"));
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0016_preview_guide_applications.sql"), "utf8"));
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0017_preview_guide_application_decisions.sql"), "utf8"));
  mocks.reader.mockReturnValue(db);
  return db;
}
function guide(db: D1Sqlite, override: Record<string, unknown> = {}) {
  const row = {
    id: "guide-1", clerk_user_id: "owner-1", status: "pending", applied_at: "2026-09-30T01:00:00Z",
    approved_at: null, stripe_account_id: null, stripe_onboarding_complete: false,
    stripe_charges_enabled: false, stripe_payouts_enabled: false, specialties: ["food"], cities: ["seoul"],
    total_earned: 0, pending_balance: 0, ...override,
  };
  db.sqlite.prepare("UPDATE legacy_guide_profile_batches SET sourceCount = 1 WHERE id = ?").run("source-20260929");
  db.sqlite.prepare("INSERT INTO legacy_guide_profiles VALUES (?, ?, ?, ?, ?, ?)")
    .run(row.id, "source-20260929", row.clerk_user_id, row.status, row.applied_at, JSON.stringify(row));
}

describe("preview guide Connect status", () => {
  it("requires the exact preview host, flag and isolated environment", () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/connect/status${flag ? "?data_candidate=d1" : ""}`);
    expect(isPreviewGuideStatusCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewGuideStatusCandidate(request("www.localley.io"))).toBe(false);
    expect(isPreviewGuideStatusCandidate(request("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    process.env.AUTH_MAIL_MODE = "binding";
    expect(isPreviewGuideStatusCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("returns no guide from the counted empty source archive", async () => {
    database();
    expect(await previewGuideStatus("owner-1")).toEqual({ isGuide: false });
  });

  it("returns a newly applied guide only to its exact owner", async () => {
    const db = database();
    db.sqlite.prepare("INSERT INTO preview_guide_applications VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("application-1", "owner-1", "pending", "Local guide", "[\"food\"]", "[\"seoul\"]", "2026-09-30T01:00:00Z");
    expect(await previewGuideStatus("other-owner")).toEqual({ isGuide: false });
    expect(await previewGuideStatus("owner-1")).toEqual({
      isGuide: true, status: "pending", onboardingComplete: false, chargesEnabled: false,
      payoutsEnabled: false, specialties: ["food"], cities: ["seoul"], totalEarned: 0,
      pendingBalance: 0, stripeStatus: null, appliedAt: "2026-09-30T01:00:00Z", approvedAt: null,
    });
  });

  it("shows a rejected preview application only to its owner", async () => {
    const db = database();
    db.sqlite.prepare("INSERT INTO preview_guide_applications VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("application-1", "owner-1", "pending", "Local guide", "[]", '["seoul"]', "2026-09-30T01:00:00Z");
    db.sqlite.prepare("INSERT INTO preview_guide_application_decisions VALUES (?, ?, ?, ?)")
      .run("owner-1", "rejected", "2026-09-30T02:00:00Z", "admin-1");
    expect(await previewGuideStatus("other-owner")).toEqual({ isGuide: false });
    expect(await previewGuideStatus("owner-1")).toMatchObject({ isGuide: true, status: "rejected" });
  });

  it("maps only the exact owner's pending guide with existing response fields", async () => {
    const db = database();
    guide(db);
    expect(await previewGuideStatus("other-owner")).toEqual({ isGuide: false });
    expect(await previewGuideStatus("owner-1")).toEqual({
      isGuide: true, status: "pending", onboardingComplete: false, chargesEnabled: false,
      payoutsEnabled: false, specialties: ["food"], cities: ["seoul"], totalEarned: 0,
      pendingBalance: 0, stripeStatus: null, appliedAt: "2026-09-30T01:00:00Z", approvedAt: null,
    });
  });

  it("refuses partial imports, invalid fields and Stripe-linked profiles", async () => {
    const db = database();
    db.sqlite.prepare("UPDATE legacy_guide_profile_batches SET sourceCount = 1").run();
    await expect(previewGuideStatus("owner-1")).rejects.toThrow("count mismatch");
    db.sqlite.prepare("UPDATE legacy_guide_profile_batches SET sourceCount = 0").run();
    guide(db, { cities: [2] });
    await expect(previewGuideStatus("owner-1")).rejects.toThrow("Invalid guide status archive");
    db.sqlite.prepare("UPDATE legacy_guide_profiles SET payload = ?").run(JSON.stringify({
      id: "guide-1", clerk_user_id: "owner-1", status: "pending", applied_at: "2026-09-30T01:00:00Z",
      approved_at: null, stripe_account_id: "acct_live", stripe_onboarding_complete: false,
      stripe_charges_enabled: false, stripe_payouts_enabled: false, specialties: [], cities: [],
      total_earned: 0, pending_balance: 0,
    }));
    await expect(previewGuideStatus("owner-1")).rejects.toThrow("Stripe-linked guide status unavailable");
  });
});

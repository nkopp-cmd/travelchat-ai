// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewAdminGuidesCandidate, previewAdminGuides } from "@/lib/app-data/preview-admin-guides";
import { previewAdminGuideList } from "@/lib/app-data/preview-admin-guides";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0015_preview_guide_profiles.sql"), "utf8"));
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0016_preview_guide_applications.sql"), "utf8"));
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0017_preview_guide_application_decisions.sql"), "utf8"));
  db.sqlite.exec("DELETE FROM legacy_guide_profile_batches");
  mocks.reader.mockReturnValue(db);
  return db;
}
function batch(db: D1Sqlite, count: number) {
  db.sqlite.prepare("INSERT INTO legacy_guide_profile_batches VALUES (?, ?, ?, ?)")
    .run("batch-1", count, "a".repeat(64), "2026-09-30T00:00:00Z");
}
function row(db: D1Sqlite, id: string, status: string, payload?: unknown) {
  const guide = payload ?? { id, clerk_user_id: `user_${id}`, status, applied_at: "2026-09-30T01:00:00Z", display_name: "Guide" };
  db.sqlite.prepare("INSERT INTO legacy_guide_profiles VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, "batch-1", `user_${id}`, status, "2026-09-30T01:00:00Z", JSON.stringify(guide));
}

describe("preview admin guide archive", () => {
  it("requires the exact preview host, candidate flag, and isolated environment", () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/admin/guides${flag ? "?data_candidate=d1" : ""}`);
    expect(isPreviewAdminGuidesCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewAdminGuidesCandidate(request("www.localley.io"))).toBe(false);
    expect(isPreviewAdminGuidesCandidate(request("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    process.env.SUPABASE_READ_ONLY = "false";
    expect(isPreviewAdminGuidesCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("rejects a missing or partial archive", async () => {
    const db = database();
    await expect(previewAdminGuides(null)).rejects.toThrow("Guide archive unavailable");
    batch(db, 1);
    await expect(previewAdminGuides(null)).rejects.toThrow("count mismatch");
  });

  it("returns a counted empty archive and filters complete source payloads", async () => {
    const db = database();
    batch(db, 0);
    expect(await previewAdminGuides(null)).toEqual([]);
    db.sqlite.prepare("UPDATE legacy_guide_profile_batches SET sourceCount = 2").run();
    row(db, "one", "pending");
    row(db, "two", "approved");
    expect((await previewAdminGuides(null)).map(guide => guide.id)).toEqual(["two", "one"]);
    expect(await previewAdminGuides("pending")).toEqual([{
      id: "one", clerk_user_id: "user_one", status: "pending",
      applied_at: "2026-09-30T01:00:00Z", display_name: "Guide",
    }]);
  });

  it("rejects invalid payloads and oversized filters", async () => {
    const db = database();
    batch(db, 1);
    row(db, "one", "pending", { id: "one", clerk_user_id: "wrong", status: "pending", applied_at: "2026-09-30T01:00:00Z" });
    await expect(previewAdminGuides(null)).rejects.toThrow("payload mismatch");
    await expect(previewAdminGuides("x".repeat(65))).rejects.toThrow("Invalid guide filter");
  });
});

describe("preview admin list of new applications", () => {
  const application = (db: D1Sqlite, id = "application-1", userId = "owner-1", specialties = '["food"]') =>
    db.sqlite.prepare("INSERT INTO preview_guide_applications VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, userId, "pending", "Local guide", specialties, '["seoul"]', "2026-09-30T02:00:00Z");

  it("merges pending applications after checking the counted source archive", async () => {
    const db = database();
    batch(db, 1);
    row(db, "source", "approved");
    application(db);
    const all = await previewAdminGuideList(null);
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ id: "application-1", clerk_user_id: "owner-1", status: "pending",
      bio: "Local guide", cities: ["seoul"], stripe_account_id: null });
    expect((await previewAdminGuideList("pending")).map(item => item.id)).toEqual(["application-1"]);
    expect((await previewAdminGuideList("approved")).map(item => item.id)).toEqual(["source"]);
  });

  it("moves a reviewed application from pending to rejected", async () => {
    const db = database();
    batch(db, 0);
    application(db);
    db.sqlite.prepare("INSERT INTO preview_guide_application_decisions VALUES (?, ?, ?, ?)")
      .run("owner-1", "rejected", "2026-09-30T03:00:00Z", "admin-1");
    expect(await previewAdminGuideList("pending")).toEqual([]);
    expect((await previewAdminGuideList("rejected"))[0]).toMatchObject({
      clerk_user_id: "owner-1", status: "rejected", reviewed_by: "admin-1",
    });
  });

  it("refuses missing source, source-owner collisions and malformed applications", async () => {
    const db = database();
    application(db);
    await expect(previewAdminGuideList(null)).rejects.toThrow("Guide archive unavailable");
    batch(db, 1);
    row(db, "source", "pending", { id: "source", clerk_user_id: "owner-1", status: "pending",
      applied_at: "2026-09-30T01:00:00Z" });
    db.sqlite.prepare("UPDATE legacy_guide_profiles SET clerkUserId = ?").run("owner-1");
    await expect(previewAdminGuideList(null)).rejects.toThrow("collision");
    db.sqlite.prepare("DELETE FROM legacy_guide_profiles").run();
    db.sqlite.prepare("UPDATE legacy_guide_profile_batches SET sourceCount = 0").run();
    db.sqlite.prepare("UPDATE preview_guide_applications SET specialties = '{}'").run();
    await expect(previewAdminGuideList(null)).rejects.toThrow("Invalid preview guide application");
  });

  it("refuses an oversized combined result", async () => {
    const db = database();
    batch(db, 0);
    const insert = db.sqlite.prepare("INSERT INTO preview_guide_applications VALUES (?, ?, ?, ?, ?, ?, ?)");
    for (let i = 0; i < 101; i++) insert.run(`id-${i}`, `owner-${i}`, "pending", "Bio", "[]", '["seoul"]', "2026-09-30T02:00:00Z");
    await expect(previewAdminGuideList(null)).rejects.toThrow("Guide applications unavailable");
  });
});

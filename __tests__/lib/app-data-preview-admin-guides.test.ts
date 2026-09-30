// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewAdminGuidesCandidate, previewAdminGuides } from "@/lib/app-data/preview-admin-guides";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0015_preview_guide_profiles.sql"), "utf8"));
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

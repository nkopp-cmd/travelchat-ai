// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { createPreviewGuideApplication, isPreviewGuideApplicationCandidate,
  parseGuideApplication, readPreviewGuideApplication, rejectPreviewGuideApplication } from "@/lib/app-data/preview-guide-application";

const originalEnvironment = process.env;
afterEach(() => { process.env = originalEnvironment; vi.clearAllMocks(); });

function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0016_preview_guide_applications.sql"), "utf8"));
  db.sqlite.exec(readFileSync(path.resolve("migrations/app-preview/0017_preview_guide_application_decisions.sql"), "utf8"));
  mocks.reader.mockReturnValue(db);
  return db;
}

describe("preview guide applications", () => {
  it("uses the exact preview host, flag and isolated environment", () => {
    process.env = { ...originalEnvironment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/connect/onboard${flag ? "?data_candidate=d1" : ""}`, { method: "POST" });
    expect(isPreviewGuideApplicationCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewGuideApplicationCandidate(request("www.localley.io"))).toBe(false);
    expect(isPreviewGuideApplicationCandidate(request("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    process.env.AUTH_MAIL_MODE = "binding";
    expect(isPreviewGuideApplicationCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("validates bounded form fields", () => {
    const input = { bio: "Local guide", specialties: [" food "], cities: ["seoul"] };
    expect(parseGuideApplication(input)).toEqual({ ...input, specialties: ["food"] });
    expect(parseGuideApplication({ ...input, bio: " " })).toBeNull();
    expect(parseGuideApplication({ ...input, cities: [] })).toBeNull();
    expect(parseGuideApplication({ ...input, specialties: [42] })).toBeNull();
    expect(parseGuideApplication({ ...input, cities: Array(13).fill("seoul") })).toBeNull();
  });

  it("creates one pending application and isolates exact owners", async () => {
    const db = database();
    const input = { bio: "Local guide", specialties: ["food"], cities: ["seoul"] };
    const first = await createPreviewGuideApplication("owner-1", input);
    const second = await createPreviewGuideApplication("owner-1", { ...input, bio: "Changed" });
    expect(second).toEqual(first);
    expect(await readPreviewGuideApplication("other-owner")).toBeNull();
    expect(await readPreviewGuideApplication("owner-1")).toEqual(first);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_guide_applications").get()).toEqual({ n: 1 });
  });

  it("records one exact-owner rejection and keeps the first admin audit", async () => {
    const db = database();
    await createPreviewGuideApplication("owner-1", { bio: "Guide", specialties: [], cities: ["seoul"] });
    const first = await rejectPreviewGuideApplication("owner-1", "admin-1");
    const repeat = await rejectPreviewGuideApplication("owner-1", "admin-2");
    expect(first.status).toBe("rejected");
    expect(first.reviewedBy).toBe("admin-1");
    expect(repeat).toEqual(first);
    expect((await readPreviewGuideApplication("owner-1"))?.status).toBe("rejected");
    expect(await readPreviewGuideApplication("owner-2")).toBeNull();
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_guide_application_decisions").get()).toEqual({ n: 1 });
  });

  it("allows one decision when two admins reject at the same time", async () => {
    const db = database();
    await createPreviewGuideApplication("owner-1", { bio: "Guide", specialties: [], cities: ["seoul"] });
    const decisions = await Promise.all([
      rejectPreviewGuideApplication("owner-1", "admin-1"),
      rejectPreviewGuideApplication("owner-1", "admin-2"),
    ]);
    expect(decisions[0].reviewedBy).toBe(decisions[1].reviewedBy);
    expect(["admin-1", "admin-2"]).toContain(decisions[0].reviewedBy);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_guide_application_decisions").get()).toEqual({ n: 1 });
  });

  it("refuses review without an application", async () => {
    database();
    await expect(rejectPreviewGuideApplication("missing", "admin-1")).rejects.toThrow("not found");
  });

  it("fails closed when D1 is missing or a row is malformed", async () => {
    mocks.reader.mockImplementation(() => { throw new Error("D1 missing"); });
    await expect(readPreviewGuideApplication("owner-1")).rejects.toThrow("D1 missing");
    const db = database();
    db.sqlite.prepare("INSERT INTO preview_guide_applications VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("id", "owner-1", "pending", null, "{}", "[]", "2026-09-30T01:00:00Z");
    await expect(readPreviewGuideApplication("owner-1")).rejects.toThrow("Invalid preview guide application");
  });
});

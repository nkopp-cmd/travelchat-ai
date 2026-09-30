// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
import { isPreviewEmailPreferencesCandidate, parsePreviewEmailPreferencePatch,
  previewEmailPreferences, updatePreviewEmailPreferences } from "@/lib/app-data/preview-email-preferences";

const environment = process.env;
afterEach(() => { process.env = environment; vi.clearAllMocks(); });
const defaults = { marketing: true, weekly_digest: true, product_updates: true, itinerary_shared: true };
function database() {
  const db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners (id TEXT PRIMARY KEY, source TEXT NOT NULL);
    CREATE TABLE legacy_owners (ownerId TEXT PRIMARY KEY, clerkUserId TEXT, hasSourceProfile INTEGER, batchId TEXT);`);
  db.sqlite.exec(readFileSync(join(process.cwd(), "migrations/app-preview/0020_preview_email_preferences.sql"), "utf8"));
  mocks.reader.mockReturnValue(db);
  return db;
}

describe("preview email preferences", () => {
  it("requires exact preview host, flag and isolated environment", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const req = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/user/email-preferences${flag ? "?data_candidate=d1" : ""}`);
    expect(isPreviewEmailPreferencesCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewEmailPreferencesCandidate(req("www.localley.io"))).toBe(false);
    expect(isPreviewEmailPreferencesCandidate(req("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    process.env.AUTH_MAIL_MODE = "cloudflare";
    expect(isPreviewEmailPreferencesCandidate(req("localley-next-preview.nkopp.workers.dev"))).toBe(false);
  });

  it("accepts only nonempty known boolean changes", () => {
    expect(parsePreviewEmailPreferencePatch({ marketing: false })).toEqual({ marketing: false });
    for (const bad of [null, [], {}, { marketing: 0 }, { marketing: false, extra: true },
      { weekly_digest: "false" }]) expect(parsePreviewEmailPreferencePatch(bad)).toBeNull();
  });

  it("creates and updates only a fresh signed-in owner's row", async () => {
    const db = database();
    expect(await previewEmailPreferences("user-a")).toEqual(defaults);
    expect(await updatePreviewEmailPreferences("user-a", { marketing: false }))
      .toEqual({ ...defaults, marketing: false });
    expect(await updatePreviewEmailPreferences("user-a", { itinerary_shared: false }))
      .toEqual({ ...defaults, marketing: false, itinerary_shared: false });
    expect(await previewEmailPreferences("user-b")).toEqual(defaults);
    expect(db.sqlite.prepare("SELECT id, source FROM owners").all()).toEqual([{ id: "auth:user-a", source: "new" }]);
    expect(db.sqlite.prepare("SELECT ownerId, marketing, itinerary_shared FROM email_preferences").all())
      .toEqual([{ ownerId: "auth:user-a", marketing: 0, itinerary_shared: 0 }]);
  });

  it("refuses missing historical preferences and malformed stored flags", async () => {
    const db = database();
    db.sqlite.prepare("INSERT INTO owners VALUES ('legacy-user', 'legacy-fixture')").run();
    db.sqlite.prepare("INSERT INTO legacy_owners VALUES ('legacy-user', 'user-a', 1, 'batch')").run();
    await expect(previewEmailPreferences("user-a")).rejects.toThrow("Historical");
    await expect(updatePreviewEmailPreferences("user-a", { marketing: false })).rejects.toThrow("Historical");
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM email_preferences").get()).toEqual({ n: 0 });
    db.sqlite.prepare("INSERT INTO email_preferences VALUES ('legacy-user', 1, 1, 1, 1)").run();
    expect(await updatePreviewEmailPreferences("user-a", { marketing: false }))
      .toEqual({ ...defaults, marketing: false });
    expect(() => db.sqlite.prepare("UPDATE email_preferences SET marketing = 2 WHERE ownerId = 'legacy-user'").run())
      .toThrow();
    db.sqlite.exec("PRAGMA ignore_check_constraints = ON");
    db.sqlite.prepare("UPDATE email_preferences SET marketing = 2 WHERE ownerId = 'legacy-user'").run();
    await expect(previewEmailPreferences("user-a")).rejects.toThrow("Invalid");
  });
});

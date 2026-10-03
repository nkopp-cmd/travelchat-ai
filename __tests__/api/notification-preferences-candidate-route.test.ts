// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), reader: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/notifications", () => ({ getNotificationPreferences: mocks.get, updateNotificationPreferences: mocks.update,
  NotificationStorageUnavailableError: class extends Error {} }));
import { GET, PATCH } from "@/app/api/notifications/preferences/route";

const original = process.env;
let db: D1Sqlite;
const host = "localley-next-preview.nkopp.workers.dev";
const request = (method = "GET", value?: unknown, hostname = host, candidate = true) => new NextRequest(
  `https://${hostname}/api/notifications/preferences${candidate ? "?data_candidate=d1" : ""}`,
  { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
function owner(id: string, email = `${id}@preview.localley.test`) {
  mocks.auth.mockResolvedValue({ userId: id });
  mocks.user.mockResolvedValue({ id, emailVerified: true, primaryEmailAddress: { emailAddress: email } });
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...original, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT NOT NULL);
    CREATE TABLE legacy_owners(ownerId TEXT PRIMARY KEY,clerkUserId TEXT,hasSourceProfile INTEGER,batchId TEXT);`);
  db.sqlite.exec(readFileSync("migrations/app-preview/0027_preview_notification_preferences.sql", "utf8"));
  mocks.reader.mockReturnValue(db);
  mocks.get.mockResolvedValue({ clerkUserId: "normal", emailEnabled: false });
  mocks.update.mockResolvedValue({ clerkUserId: "normal", emailEnabled: false });
  owner("owner-a");
});
afterEach(() => { process.env = original; db.sqlite.close(); });

describe("D1 notification preference candidate", () => {
  it("persists defaults and concurrent first reads without replacing saved choices", async () => {
    const responses = await Promise.all([GET(request()), GET(request())]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.headers.get("x-localley-data-source")).toBe("d1-preview");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toMatchObject({ clerkUserId: "owner-a", emailEnabled: true, timezone: "UTC" });
    }
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_notification_preferences").get()).toEqual({ n: 1 });
    expect((await PATCH(request("PATCH", { emailEnabled: false }))).status).toBe(200);
    for (const response of await Promise.all([GET(request()), GET(request())])) {
      expect((await response.json()).emailEnabled).toBe(false);
    }
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps partial updates, quiet-hour clearing and two owners separate", async () => {
    const patch = await PATCH(request("PATCH", { emailEnabled: false, weeklyDigest: false,
      quietHoursStart: "22:30", quietHoursEnd: "07:00:00", timezone: "Asia/Seoul" }));
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ emailEnabled: false, weeklyDigest: false, timezone: "Asia/Seoul" });
    await PATCH(request("PATCH", { quietHoursStart: null, social: false }));
    const saved = await (await GET(request())).json();
    expect(saved).toMatchObject({ emailEnabled: false, social: false, quietHoursEnd: "07:00:00" });
    expect(saved).not.toHaveProperty("quietHoursStart");
    owner("owner-b");
    expect(await (await GET(request())).json()).toMatchObject({ clerkUserId: "owner-b", emailEnabled: true, timezone: "UTC" });
    expect(db.sqlite.prepare("SELECT ownerId,emailEnabled FROM preview_notification_preferences ORDER BY ownerId").all())
      .toEqual([{ ownerId: "auth:owner-a", emailEnabled: 0 }, { ownerId: "auth:owner-b", emailEnabled: 1 }]);
  });

  it("refuses owner reassignment, unknown fields, invalid flags, times and zones before writes", async () => {
    for (const value of [{ clerkUserId: "owner-b", emailEnabled: false }, { ownerId: "auth:owner-b" },
      {}, [], { emailEnabled: "false" }, { quietHoursStart: "24:00" }, { timezone: "invalid/zone" }]) {
      expect((await PATCH(request("PATCH", value))).status).toBe(400);
    }
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM owners").get()).toEqual({ n: 0 });
  });

  it("bounds body bytes and rejects malformed JSON without creating rows", async () => {
    const make = (body: string) => new NextRequest(`https://${host}/api/notifications/preferences?data_candidate=d1`,
      { method: "PATCH", body });
    expect((await PATCH(make("{"))).status).toBe(400);
    expect((await PATCH(make(JSON.stringify({ timezone: "界".repeat(3000) })))).status).toBe(400);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM owners").get()).toEqual({ n: 0 });
  });

  it("requires verified isolated accounts and refuses missing historical preferences", async () => {
    owner("owner-a", "someone@example.com");
    expect((await GET(request())).status).toBe(503);
    owner("owner-a");
    db.sqlite.exec("INSERT INTO owners VALUES ('legacy-a','legacy-fixture'); INSERT INTO legacy_owners VALUES ('legacy-a','owner-a',1,'batch');");
    expect((await GET(request())).status).toBe(503);
    expect((await PATCH(request("PATCH", { social: false }))).status).toBe(503);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_notification_preferences").get()).toEqual({ n: 0 });
  });

  it("never falls back to Supabase when candidate D1 fails", async () => {
    mocks.reader.mockImplementationOnce(() => { throw new Error("private database error"); });
    const response = await GET(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private database error");
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });

  it("retains www and unflagged preview routing for reads and writes", async () => {
    for (const [hostname, candidate] of [["www.localley.io", true], [host, false]] as const) {
      expect((await GET(request("GET", undefined, hostname, candidate))).headers.get("x-localley-data-source")).toBeNull();
      expect((await PATCH(request("PATCH", { emailEnabled: false }, hostname, candidate))).status).toBe(200);
    }
    expect(mocks.get).toHaveBeenCalledTimes(2); expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.reader).not.toHaveBeenCalled();
  });

  it("requires authentication before any candidate read or write", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request())).status).toBe(401);
    expect((await PATCH(request("PATCH", { emailEnabled: false }))).status).toBe(401);
    expect(mocks.reader).not.toHaveBeenCalled();
  });
});

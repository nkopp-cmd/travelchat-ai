// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), reader: vi.fn(),
  list: vi.fn(), all: vi.fn(), mark: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/notifications", () => ({ getUserNotifications: mocks.list, markAllNotificationsRead: mocks.all,
  markNotificationRead: mocks.mark, deleteNotification: mocks.remove }));
import { GET, POST } from "@/app/api/notifications/route";
import { PATCH, DELETE } from "@/app/api/notifications/[id]/route";
import { isPreviewNotificationCandidate, parsePreviewNotificationPage } from "@/lib/app-data/preview-notifications";

const originalEnv = process.env;
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333"];
let db: D1Sqlite;
const url = (host = "localley-next-preview.nkopp.workers.dev", query = "data_candidate=d1") =>
  `https://${host}/api/notifications${query ? `?${query}` : ""}`;
const request = (method: string, host?: string, query?: string, body?: unknown) =>
  new NextRequest(url(host, query), { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const item = (method: string, id = ids[0], host = "localley-next-preview.nkopp.workers.dev", candidate = true) =>
  new NextRequest(`https://${host}/api/notifications/${id}${candidate ? "?data_candidate=d1" : ""}`, { method });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  process.env = { ...originalEnv, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  db = new D1Sqlite();
  db.sqlite.exec(`CREATE TABLE owners (id TEXT PRIMARY KEY, source TEXT NOT NULL);
    CREATE TABLE legacy_owners (ownerId TEXT PRIMARY KEY, clerkUserId TEXT, hasSourceProfile INTEGER, batchId TEXT);
    INSERT INTO owners VALUES ('auth:user-a','new'), ('auth:user-b','new');`);
  db.sqlite.exec(readFileSync(join(process.cwd(), "migrations/app-preview/0021_preview_notifications.sql"), "utf8"));
  mocks.reader.mockReturnValue(db);
  mocks.auth.mockResolvedValue({ userId: "user-a" });
  mocks.currentUser.mockResolvedValue({ id: "user-a", emailVerified: true,
    primaryEmailAddress: { emailAddress: "one@preview.localley.test" } });
  for (const [index, ownerId, read] of [[0, "auth:user-a", 0], [1, "auth:user-a", 0],
    [2, "auth:user-b", 0]] as const) {
    db.sqlite.prepare(`INSERT INTO preview_notifications
      (id,ownerId,type,title,message,data,isRead,createdAt) VALUES (?,?,?,?,?,?,?,?)`)
      .run(ids[index], ownerId, "system", `Title ${index}`, `Message ${index}`,
        JSON.stringify({ url: "/dashboard" }), read, `2026-09-30T12:00:0${index}.000Z`);
  }
});
afterEach(() => { process.env = originalEnv; vi.clearAllMocks(); });

describe("preview notification inbox", () => {
  it("requires exact host, flag, isolated mode and bounded page input", () => {
    expect(isPreviewNotificationCandidate(request("GET"))).toBe(true);
    expect(isPreviewNotificationCandidate(request("GET", "www.localley.io"))).toBe(false);
    expect(isPreviewNotificationCandidate(request("GET", undefined, ""))).toBe(false);
    process.env.AUTH_MAIL_MODE = "cloudflare";
    expect(isPreviewNotificationCandidate(request("GET"))).toBe(false);
    process.env.AUTH_MAIL_MODE = "outbox";
    expect(parsePreviewNotificationPage(request("GET", undefined, "data_candidate=d1&limit=2&offset=1&unreadOnly=true")))
      .toEqual({ limit: 2, offset: 1, unreadOnly: true });
    for (const query of ["limit=0", "limit=51", "limit=2x", "offset=-1", "offset=1001", "unreadOnly=yes"])
      expect(parsePreviewNotificationPage(request("GET", undefined, query))).toBeNull();
  });

  it("returns only the signed-in owner's ordered rows and count with private headers", async () => {
    const response = await GET(request("GET", undefined, "data_candidate=d1&limit=1&offset=0"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-localley-data-source")).toBe("d1-preview");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ notifications: [{ id: ids[1], clerkUserId: "user-a",
      type: "system", title: "Title 1", message: "Message 1", data: { url: "/dashboard" },
      read: false, createdAt: "2026-09-30T12:00:01.000Z" }], unreadCount: 2 });
    expect((await GET(request("GET", undefined, "data_candidate=d1&limit=1&offset=1"))).status).toBe(200);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("marks one, marks all, and deletes only owner rows; repeated writes stay safe", async () => {
    expect((await PATCH(item("PATCH", ids[2]), ctx(ids[2]))).status).toBe(200);
    expect((await PATCH(item("PATCH", ids[0]), ctx(ids[0]))).status).toBe(200);
    expect((await PATCH(item("PATCH", ids[0]), ctx(ids[0]))).status).toBe(200);
    expect(db.sqlite.prepare("SELECT isRead FROM preview_notifications WHERE id=?").get(ids[0])).toEqual({ isRead: 1 });
    const unread = await GET(request("GET", undefined, "data_candidate=d1&unreadOnly=true"));
    expect((await unread.json()).unreadCount).toBe(1);
    expect((await POST(request("POST", undefined, undefined, { action: "markAllRead" }))).status).toBe(200);
    expect((await POST(request("POST", undefined, undefined, { action: "markAllRead" }))).status).toBe(200);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_notifications WHERE ownerId='auth:user-a' AND isRead=0").get())
      .toEqual({ n: 0 });
    expect(db.sqlite.prepare("SELECT isRead FROM preview_notifications WHERE id=?").get(ids[2])).toEqual({ isRead: 0 });
    expect((await DELETE(item("DELETE", ids[2]), ctx(ids[2]))).status).toBe(200);
    expect((await DELETE(item("DELETE", ids[0]), ctx(ids[0]))).status).toBe(200);
    expect((await DELETE(item("DELETE", ids[0]), ctx(ids[0]))).status).toBe(200);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_notifications WHERE ownerId='auth:user-a'").get())
      .toEqual({ n: 1 });
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_notifications WHERE ownerId='auth:user-b'").get())
      .toEqual({ n: 1 });
  });

  it("rejects invalid actions and IDs without changing rows", async () => {
    expect((await GET(request("GET", undefined, "data_candidate=d1&limit=51"))).status).toBe(400);
    expect((await POST(request("POST", undefined, undefined, { action: "erase" }))).status).toBe(400);
    expect((await POST(new NextRequest(url(), { method: "POST", body: "not-json" }))).status).toBe(400);
    expect((await PATCH(item("PATCH", "wrong"), ctx("wrong"))).status).toBe(400);
    expect((await DELETE(item("DELETE", "wrong"), ctx("wrong"))).status).toBe(400);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_notifications").get()).toEqual({ n: 3 });
  });

  it("fails closed for real, unverified and historical owners", async () => {
    for (const user of [
      { id: "user-a", emailVerified: true, primaryEmailAddress: { emailAddress: "real@example.com" } },
      { id: "user-a", emailVerified: false, primaryEmailAddress: { emailAddress: "one@preview.localley.test" } },
      { id: "other", emailVerified: true, primaryEmailAddress: { emailAddress: "one@preview.localley.test" } },
    ]) { mocks.currentUser.mockResolvedValue(user); expect((await GET(request("GET"))).status).toBe(503); }
    mocks.currentUser.mockResolvedValue({ id: "user-a", emailVerified: true,
      primaryEmailAddress: { emailAddress: "one@preview.localley.test" } });
    db.sqlite.exec(`INSERT INTO owners VALUES ('legacy-a','legacy-fixture');
      INSERT INTO legacy_owners VALUES ('legacy-a','user-a',1,'batch');`);
    expect((await GET(request("GET"))).status).toBe(503);
    expect((await POST(request("POST", undefined, undefined, { action: "markAllRead" }))).status).toBe(503);
    expect(db.sqlite.prepare("SELECT count(*) AS n FROM preview_notifications WHERE isRead=1").get()).toEqual({ n: 0 });
  });

  it("refuses malformed stored data", async () => {
    expect(() => db.sqlite.prepare("UPDATE preview_notifications SET data='[]' WHERE id=?").run(ids[0])).toThrow();
    db.sqlite.exec("PRAGMA ignore_check_constraints = ON");
    db.sqlite.prepare("UPDATE preview_notifications SET data='[]' WHERE id=?").run(ids[0]);
    expect((await GET(request("GET"))).status).toBe(503);
  });

  it("keeps normal preview and www on their existing repository", async () => {
    mocks.list.mockResolvedValue({ notifications: [], unreadCount: 0 });
    mocks.all.mockResolvedValue(true); mocks.mark.mockResolvedValue(true); mocks.remove.mockResolvedValue(true);
    expect((await GET(request("GET", undefined, ""))).status).toBe(200);
    expect((await POST(request("POST", "www.localley.io", undefined, { action: "markAllRead" }))).status).toBe(200);
    expect((await PATCH(item("PATCH", ids[0], "www.localley.io"), ctx(ids[0]))).status).toBe(200);
    expect((await DELETE(item("DELETE", ids[0], "www.localley.io"), ctx(ids[0]))).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledOnce();
    expect(mocks.all).toHaveBeenCalledOnce();
    expect(mocks.mark).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("requires auth before candidate reads and writes", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await GET(request("GET"))).status).toBe(401);
    expect((await POST(request("POST", undefined, undefined, { action: "markAllRead" }))).status).toBe(401);
    expect((await PATCH(item("PATCH"), ctx(ids[0]))).status).toBe(401);
    expect((await DELETE(item("DELETE"), ctx(ids[0]))).status).toBe(401);
    expect(mocks.reader).not.toHaveBeenCalled();
  });
});

// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const m = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), user: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: m.auth, getSession: m.session, currentUser: m.user,
  authHosts: () => ["www.localley.io", "localley.io", "next.localley.io", "localley-next-preview.nkopp.workers.dev"] }));
vi.mock("@/lib/notifications", () => ({ getUserNotifications: m.source, markAllNotificationsRead: m.source,
  getNotificationPreferences: m.source, updateNotificationPreferences: m.source, markNotificationRead: m.source,
  deleteNotification: m.source, savePushSubscription: m.source, removePushSubscription: m.source,
  NotificationStorageUnavailableError: class extends Error {} }));
import { GET as inbox, POST as allRead } from "@/app/api/notifications/route";
import { GET as preferences, PATCH as update } from "@/app/api/notifications/preferences/route";
import { PATCH as mark, DELETE as remove } from "@/app/api/notifications/[id]/route";
import { POST as subscribe, DELETE as unsubscribe } from "@/app/api/notifications/push/subscribe/route";
import { createAuth, type AuthMail } from "@/lib/auth/config";

const symbol = Symbol.for("__cloudflare-context__");
const context = globalThis as unknown as Record<symbol, unknown>;
let db: D1Sqlite, previous: unknown;
const originalEnv = process.env;
const ownerA = "opaque-normal-owner-a", ownerB = "user_migrated_owner_b";
function mode(value: unknown = "active", binding: unknown = db) { context[symbol] = { env: { AUTH_DB: binding, AUTH_NOTIFICATION_STORAGE: value } }; }
function owner(id = ownerA) {
  m.auth.mockResolvedValue({ userId: id, sessionId: `session-${id}` });
  m.session.mockResolvedValue({ user: { id, emailVerified: true }, session: { id: `session-${id}` } });
  m.user.mockResolvedValue({ id, emailVerified: true, primaryEmailAddress: { emailAddress: `${id}@example.test` } });
}
function request(method = "GET", body?: unknown, path = "/api/notifications/preferences", host = "www.localley.io", headers: Record<string, string> = {}) {
  return new NextRequest(`https://${host}${path}`, { method, headers: { origin: `https://${host}`, ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" || body instanceof Uint8Array ? body : JSON.stringify(body) }) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
function notice(userId = ownerA) {
  const id = randomUUID(); db.sqlite.prepare(`INSERT INTO auth_notifications(id,userId,type,title,message) VALUES (?,?,?,?,?)`)
    .run(id, userId, "system", `Notice ${userId}`, "Private content"); return id;
}
function push(endpoint = "https://push.example.test/private/device-a") {
  const key = createECDH("prime256v1"); key.generateKeys();
  return { endpoint, keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}
const snapshot = () => ["auth_notification_preferences", "auth_notifications", "auth_push_subscriptions"]
  .map(table => db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
beforeEach(() => {
  vi.clearAllMocks(); previous = context[symbol]; process.env = { ...originalEnv, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  db = new D1Sqlite(); db.sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of ["0001_better_auth.sql", "0002_preview_mail_outbox.sql", "0003_itinerary_mail_limits.sql", "0004_notification_storage.sql"])
    db.sqlite.exec(readFileSync(`migrations/auth/${file}`, "utf8"));
  for (const id of [ownerA, ownerB]) {
    db.sqlite.prepare(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)`)
      .run(id, id, `${id}@example.test`, 1, Date.now(), Date.now());
    db.sqlite.prepare(`INSERT INTO session(id,expiresAt,token,createdAt,updatedAt,userId) VALUES (?,?,?,?,?,?)`)
      .run(`session-${id}`, Date.now() + 600000, `token-${id}`, Date.now(), Date.now(), id);
  }
  owner(); mode(); m.source.mockResolvedValue({ legacy: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { context[symbol] = previous; process.env = originalEnv; db.sqlite.close(); vi.restoreAllMocks(); });

describe("normal verified canonical Auth notification routes", () => {
  it("reads false defaults without Source, reserved email checks or implicit inserts", async () => {
    const result = await preferences(request()); expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store"); expect(result.headers.get("vary")).toBe("Cookie");
    expect(result.headers.get("x-localley-data-source")).toBe("auth-d1");
    expect(await result.json()).toMatchObject({ clerkUserId: ownerA, emailEnabled: false, pushEnabled: false,
      achievements: false, social: false, system: false, storageWritable: true, deliveryEnabled: false });
    expect(snapshot()).toEqual([[], [], []]); expect(m.source).not.toHaveBeenCalled();
  });
  it("saves partial choices, reloads and isolates a second normal owner", async () => {
    expect((await update(request("PATCH", { social: true, timezone: "Asia/Seoul" }))).status).toBe(200);
    expect((await update(request("PATCH", { achievements: true }))).status).toBe(200);
    expect(await (await preferences(request())).json()).toMatchObject({ social: true, achievements: true, emailEnabled: false, timezone: "Asia/Seoul" });
    owner(ownerB); expect(await (await preferences(request())).json()).toMatchObject({ clerkUserId: ownerB, social: false, achievements: false });
    expect(m.source).not.toHaveBeenCalled();
  });
  it("runs inbox read/mark/delete actions only for the current session owner", async () => {
    const own = notice(), foreign = notice(ownerB);
    let result = await inbox(request("GET", undefined, "/api/notifications?limit=1"));
    expect((await result.json()).notifications.map((n: { id: string }) => n.id)).toEqual([own]);
    expect(await (await mark(request("PATCH"), params(foreign))).json()).toEqual({ success: false });
    expect(await (await remove(request("DELETE"), params(foreign))).json()).toEqual({ success: false });
    expect(await (await remove(request("DELETE"), params(randomUUID()))).json()).toEqual({ success: false });
    expect(await (await mark(request("PATCH"), params(own))).json()).toEqual({ success: true });
    expect(await (await allRead(request("POST", { action: "markAllRead" }))).json()).toEqual({ success: true });
    result = await inbox(request("GET", undefined, "/api/notifications")); expect((await result.json()).unreadCount).toBe(0);
    expect(await (await remove(request("DELETE"), params(own))).json()).toEqual({ success: true });
    owner(ownerB); result = await inbox(request("GET", undefined, "/api/notifications"));
    expect((await result.json()).notifications).toMatchObject([{ id: foreign, read: false }]); expect(m.source).not.toHaveBeenCalled();
  });
  it("saves and removes device keys without returning them or enabling delivery", async () => {
    const input = push(); const result = await subscribe(request("POST", { subscription: input }));
    expect(result.status).toBe(200); expect(await result.json()).toEqual({ success: true, deliveryEnabled: false });
    const before = snapshot(); owner(ownerB);
    expect((await subscribe(request("POST", { subscription: push(input.endpoint) }))).status).toBe(503);
    expect((await unsubscribe(request("DELETE", { endpoint: input.endpoint }))).status).toBe(200); expect(snapshot()).toEqual(before);
    owner(); expect((await unsubscribe(request("DELETE", { endpoint: input.endpoint }))).status).toBe(200);
    expect(snapshot()[2]).toEqual([]); expect(m.source).not.toHaveBeenCalled();
  });
  it("keeps selected storage errors private and never falls back to Source", async () => {
    mode("active", { prepare: () => { throw Error("sensitive-bound-endpoint-and-key"); } });
    for (const handler of [() => preferences(request()), () => update(request("PATCH", { social: true })),
      () => inbox(request()), () => subscribe(request("POST", { subscription: push() }))]) {
      const result = await handler(); expect(result.status).toBe(503); expect(await result.text()).not.toContain("sensitive");
      expect(result.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("sensitive"); expect(m.source).not.toHaveBeenCalled();
  });
  it.each(["readonly", "active"])("allows authenticated reads on production hosts in %s", async selected => {
    mode(selected);
    for (const host of ["www.localley.io", "localley.io", "next.localley.io"]) expect((await preferences(request("GET", undefined, undefined, host))).status).toBe(200);
  });
  it("provides a compatible read-only rollback that retains rows, preferences and device keys", async () => {
    await update(request("PATCH", { social: true })); const own = notice(); await subscribe(request("POST", { subscription: push() }));
    const before = snapshot(); mode("readonly");
    expect(await (await preferences(request())).json()).toMatchObject({ social: true, storageWritable: false, deliveryEnabled: false });
    expect((await (await inbox(request())).json()).notifications).toMatchObject([{ id: own }]);
    for (const handler of [() => update(request("PATCH", { social: false })), () => allRead(request("POST", { action: "markAllRead" })),
      () => mark(request("PATCH"), params(own)), () => remove(request("DELETE"), params(own)),
      () => subscribe(request("POST", { subscription: push() })), () => unsubscribe(request("DELETE", { endpoint: push().endpoint }))]) {
      const result = await handler(); expect(result.status).toBe(503); expect(result.headers.get("x-localley-notification-writable")).toBe("false");
    }
    expect(snapshot()).toEqual(before); mode(); expect((await update(request("PATCH", { social: false }))).status).toBe(200);
    expect(m.source).not.toHaveBeenCalled();
  });
  it.each([undefined, "off"])("retains the legacy path when actual Worker mode is %s", async selected => {
    mode(selected); if (selected === undefined) context[symbol] = { env: { AUTH_DB: db } };
    const result = await preferences(request()); expect(await result.json()).toEqual({ legacy: true });
    expect(m.source).toHaveBeenCalledWith(ownerA); expect(m.session).not.toHaveBeenCalled(); expect(snapshot()).toEqual([[], [], []]);
  });
  it("ignores bundled process.env activation and refuses invalid actual mode or binding", async () => {
    context[symbol] = undefined; process.env.AUTH_NOTIFICATION_STORAGE = "active";
    expect(await (await preferences(request())).json()).toEqual({ legacy: true }); m.source.mockClear();
    for (const selected of [true, "", "enabled"]) { mode(selected); expect((await preferences(request())).status).toBe(503); }
    mode("active", {}); expect((await preferences(request())).status).toBe(503); expect(m.source).not.toHaveBeenCalled();
  });
  it("preserves exact-preview candidate admission before the new store", async () => {
    const result = await preferences(request("GET", undefined, "/api/notifications/preferences?data_candidate=d1", "localley-next-preview.nkopp.workers.dev"));
    expect(result.status).toBe(503); expect(result.headers.get("x-localley-data-source")).toBe("d1-preview");
    expect(m.session).not.toHaveBeenCalled(); expect(m.source).not.toHaveBeenCalled(); expect(snapshot()).toEqual([[], [], []]);
  });
  it.each(["signed-out", "cached-unverified", "physical-unverified", "mismatched", "revoked", "expired", "missing-user"])("refuses %s with no storage mutation", async condition => {
    if (condition === "signed-out") m.auth.mockResolvedValue({ userId: null });
    if (condition === "cached-unverified") m.session.mockResolvedValue({ user: { id: ownerA, emailVerified: false }, session: { id: `session-${ownerA}` } });
    if (condition === "physical-unverified") db.sqlite.prepare('UPDATE "user" SET emailVerified=0 WHERE id=?').run(ownerA);
    if (condition === "mismatched") m.session.mockResolvedValue({ user: { id: ownerB, emailVerified: true }, session: { id: `session-${ownerB}` } });
    if (condition === "revoked") db.sqlite.prepare("DELETE FROM session WHERE userId=?").run(ownerA);
    if (condition === "expired") db.sqlite.prepare("UPDATE session SET expiresAt=? WHERE userId=?").run(Date.now() - 1000, ownerA);
    if (condition === "missing-user") db.sqlite.prepare('DELETE FROM "user" WHERE id=?').run(ownerA);
    const denial = await preferences(request());
    expect([401, 403]).toContain(denial.status);
    expect(denial.headers.get("cache-control")).toBe("private, no-store");
    expect([401, 403]).toContain((await update(request("PATCH", { social: true }))).status);
    expect(m.source).not.toHaveBeenCalled(); expect(snapshot()).toEqual([[], [], []]);
  });
  it("refuses host, origin and account-switch claims without trusting forwarded headers", async () => {
    expect((await preferences(request("GET", undefined, undefined, "evil.example.test", { "x-forwarded-host": "www.localley.io" }))).status).toBe(403);
    for (const headers of [{ origin: "https://evil.example.test" }, { origin: "" }, { "sec-fetch-site": "cross-site" },
      { "x-localley-notification-owner": ownerB }]) {
      expect((await update(request("PATCH", { social: true }, undefined, undefined, headers))).status).toBe(403);
    }
    expect(snapshot()).toEqual([[], [], []]); expect(m.source).not.toHaveBeenCalled();
  });
  it.each(["{", " ".repeat(8193), new Uint8Array([0xff]), {}, [], { userId: ownerB, social: true }])("refuses malformed and owner-bearing bodies %j", async value => {
    expect((await update(request("PATCH", value))).status).toBe(400); expect(snapshot()).toEqual([[], [], []]); expect(m.source).not.toHaveBeenCalled();
  });
  it("bounds pages, action names and IDs before writes", async () => {
    expect((await inbox(request("GET", undefined, "/api/notifications?limit=51"))).status).toBe(400);
    expect((await allRead(request("POST", { action: "markAllRead", userId: ownerB }))).status).toBe(400);
    expect((await mark(request("PATCH"), params("invalid"))).status).toBe(400); expect(snapshot()).toEqual([[], [], []]);
  });
  it.each([["2099-01-01 12:00:00", 200], ["2000-01-01 12:00:00", 403], ["broken", 403]])("checks SQLite UTC session expiry %s", async (value, status) => {
    db.sqlite.prepare("UPDATE session SET expiresAt=? WHERE userId=?").run(value, ownerA);
    expect((await preferences(request())).status).toBe(status);
  });
  it("reads a real Better Auth-written verified integer and native session for a non-reserved email", async () => {
    const mails: AuthMail[] = [], base = "https://www.localley.io";
    const native = createAuth({ database: db as never, secret: "local-test-secret-0123456789abcdef0123456789", baseURL: base,
      trustedOrigins: [base], rateLimit: false, sendMail: async mail => { mails.push(mail); } });
    const signup = await native.handler(new Request(`${base}/api/auth/sign-up/email`, { method: "POST",
      headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ name: "Local fixture", email: "normal-owner@example.test", password: "local-test-only-47c7a" }) }));
    expect(signup.status).toBe(200); expect(mails).toHaveLength(1);
    const verified = await native.handler(new Request(mails[0].url, { redirect: "manual" }));
    expect([200, 302]).toContain(verified.status);
    const cookie = verified.headers.getSetCookie().map(c => c.split(";")[0]).filter(c => !c.endsWith("=")).join("; ");
    const session = await native.api.getSession({ headers: new Headers({ cookie }) }); expect(session).not.toBeNull();
    const physical = db.sqlite.prepare('SELECT id,emailVerified FROM "user" WHERE email=?').get("normal-owner@example.test") as { id: string; emailVerified: number };
    expect(physical.emailVerified).toBe(1); expect(physical.id).toBe(session!.user.id);
    m.auth.mockResolvedValue({ userId: physical.id, sessionId: session!.session.id }); m.session.mockResolvedValue(session);
    const result = await update(request("PATCH", { social: true })); expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ clerkUserId: physical.id, social: true, deliveryEnabled: false });
    expect(m.source).not.toHaveBeenCalled();
  });
});

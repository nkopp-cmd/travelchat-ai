// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
import { AuthNotificationStore, NotificationStoreUnavailable, PushRegistrationRefused } from "@/lib/notifications/auth-store";
import { parseNotificationPage, parsePreferencePatch, parsePushSubscription, preferenceFlags,
  readNotificationBody } from "@/lib/notifications/validation";

let db: D1Sqlite;
const ownerA = "opaque-canonical-owner-a", ownerB = "user_migrated_owner_b";
const store = (id = ownerA) => new AuthNotificationStore(db, id);
const page = { limit: 20, offset: 0, unreadOnly: false };
const rows = (table: string) => db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
function seed(userId = ownerA, options: Record<string, unknown> = {}) {
  const id = randomUUID();
  db.sqlite.prepare(`INSERT INTO auth_notifications(id,userId,type,title,message,data,isRead,createdAt)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, userId, "system", options.title ?? "Private notice", "Private message",
      JSON.stringify(options.data ?? {}), options.isRead ?? 0, options.createdAt ?? "2026-10-17T00:00:00.000Z");
  return id;
}
function push(endpoint = "https://push.example.test/device-a") {
  const key = createECDH("prime256v1"); key.generateKeys();
  return { endpoint, keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}
beforeEach(() => {
  db = new D1Sqlite(); db.sqlite.exec("PRAGMA foreign_keys=ON");
  db.sqlite.exec(readFileSync("migrations/auth/0001_better_auth.sql", "utf8"));
  db.sqlite.exec(readFileSync("migrations/auth/0002_preview_mail_outbox.sql", "utf8"));
  db.sqlite.exec(readFileSync("migrations/auth/0003_itinerary_mail_limits.sql", "utf8"));
  for (const [id, verified] of [[ownerA, 1], [ownerB, 1], ["unverified-owner", 0]] as const) {
    db.sqlite.prepare(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)`)
      .run(id, id, `${id}@example.test`, verified, "2026-10-17", "2026-10-17");
  }
  db.sqlite.exec(readFileSync("migrations/auth/0004_notification_storage.sql", "utf8"));
});
afterEach(() => { vi.restoreAllMocks(); db.sqlite.close(); });

describe("additive canonical Auth notification storage; no delivery", () => {
  it("preserves all existing Auth schema and rows when the migration runs", () => {
    const fresh = new D1Sqlite();
    try {
      fresh.sqlite.exec("PRAGMA foreign_keys=ON");
      for (const file of ["0001_better_auth.sql", "0002_preview_mail_outbox.sql", "0003_itinerary_mail_limits.sql"])
        fresh.sqlite.exec(readFileSync(`migrations/auth/${file}`, "utf8"));
      fresh.sqlite.exec(`INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt)
        VALUES ('opaque-admin','Admin','admin@example.test',1,'2026-10-17','2026-10-17');
        INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt)
        VALUES ('acct','opaque-admin','credential','opaque-admin','2026-10-17','2026-10-17')`);
      const schema = fresh.sqlite.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
      const users = fresh.sqlite.prepare('SELECT * FROM "user"').all(), accounts = fresh.sqlite.prepare("SELECT * FROM account").all();
      fresh.sqlite.exec(readFileSync("migrations/auth/0004_notification_storage.sql", "utf8"));
      for (const row of schema as { name: string; sql: string }[]) expect(fresh.sqlite.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(row.name)).toEqual({ sql: row.sql });
      expect(fresh.sqlite.prepare('SELECT * FROM "user"').all()).toEqual(users);
      expect(fresh.sqlite.prepare("SELECT * FROM account").all()).toEqual(accounts);
      expect(fresh.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { fresh.sqlite.close(); }
  });
  it("returns every preference FALSE without creating a row", async () => {
    const result = await store().getPreferences();
    expect(result.clerkUserId).toBe(ownerA); expect(result.timezone).toBe("UTC");
    for (const key of preferenceFlags) expect(result[key]).toBe(false);
    expect(rows("auth_notification_preferences")).toEqual([]);
  });
  it("uses actual opaque or migrated IDs without an email or reserved suffix rule", async () => {
    for (const owner of [ownerA, ownerB]) {
      expect((await store(owner).updatePreferences({ system: true })).clerkUserId).toBe(owner);
    }
    expect(rows("auth_notification_preferences")).toHaveLength(2);
    expect((await store().getPreferences()).pushEnabled).toBe(false);
  });
  it("preserves independent partial patches and exact quiet-hour null clears", async () => {
    await Promise.all([store().updatePreferences({ achievements: true }), store().updatePreferences({ social: true })]);
    await store().updatePreferences({ quietHoursStart: "23:15", quietHoursEnd: "07:10:00", timezone: "Asia/Seoul" });
    const result = await store().updatePreferences({ quietHoursStart: null });
    expect(result).toMatchObject({ achievements: true, social: true, quietHoursEnd: "07:10:00", timezone: "Asia/Seoul" });
    expect(result.quietHoursStart).toBeUndefined(); expect((await store(ownerB).getPreferences()).social).toBe(false);
  });
  it.each(["unverified-owner", "absent-owner"])("refuses every store operation for %s", async id => {
    const input = push(), subject = store(id);
    for (const operation of [() => subject.getPreferences(), () => subject.updatePreferences({ system: true }),
      () => subject.inbox(page), () => subject.markRead(), () => subject.delete(randomUUID()),
      () => subject.removePush(input.endpoint)]) {
      await expect(operation()).rejects.toThrow("Notification storage is unavailable.");
    }
    await expect(subject.savePush(input)).rejects.toThrow(PushRegistrationRefused);
    for (const table of ["auth_notifications", "auth_notification_preferences", "auth_push_subscriptions"]) expect(rows(table)).toEqual([]);
  });
  it("rechecks verification inside the preferences write", async () => {
    const prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation(sql => {
      if (sql.startsWith("INSERT INTO auth_notification_preferences")) db.sqlite.exec(`UPDATE "user" SET emailVerified=0 WHERE id='${ownerA}'`);
      return prepare(sql);
    });
    await expect(store().updatePreferences({ system: true })).rejects.toThrow();
    expect(rows("auth_notification_preferences")).toEqual([]);
  });
  it("rechecks verification inside inbox mutations after owner admission", async () => {
    const id = seed(), before = rows("auth_notifications"), prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation(sql => {
      if (sql.startsWith("UPDATE auth_notifications")) db.sqlite.exec(`UPDATE "user" SET emailVerified=0 WHERE id='${ownerA}'`);
      return prepare(sql);
    });
    expect(await store().markRead(id)).toBe(false); expect(rows("auth_notifications")).toEqual(before);
  });
  it("keeps inbox paging and unread counts owner-scoped with stable equal-date ordering", async () => {
    const ids = Array.from({ length: 4 }, () => seed()).sort().reverse(); seed(ownerB);
    const first = await store().inbox({ ...page, limit: 2 });
    expect(first.notifications.map(n => n.id)).toEqual(ids.slice(0, 2)); expect(first.unreadCount).toBe(4); expect(first.hasMore).toBe(true);
    const second = await store().inbox({ ...page, limit: 2, offset: 2 });
    expect(second.notifications.map(n => n.id)).toEqual(ids.slice(2)); expect(second.hasMore).toBe(false);
    expect((await store(ownerB).inbox(page)).notifications).toHaveLength(1);
  });
  it("does not leak a foreign row through unread OR predicates or actions", async () => {
    const own = seed(), foreign = seed(ownerB), before = rows("auth_notifications");
    expect(await store().markRead(foreign)).toBe(false); expect(await store().delete(foreign)).toBe(false);
    expect(await store().delete(randomUUID())).toBe(false); expect(rows("auth_notifications")).toEqual(before);
    expect(await store().markRead(own)).toBe(true); const readAt = (await store().inbox(page)).notifications[0].readAt;
    expect(await store().markRead(own)).toBe(true); expect((await store().inbox(page)).notifications[0].readAt).toBe(readAt);
    expect((await store().inbox({ ...page, unreadOnly: true })).notifications).toEqual([]);
    expect((await store(ownerB).inbox(page)).unreadCount).toBe(1);
    expect(await store().delete(own)).toBe(true); expect(await store().delete(own)).toBe(false);
  });
  it("marks all owned notices while preserving foreign rows and existing read times", async () => {
    seed(); seed(); seed(ownerB); expect(await store().markRead()).toBe(true);
    const before = rows("auth_notifications"); expect(await store().markRead()).toBe(true);
    expect(rows("auth_notifications")).toEqual(before); expect((await store().inbox(page)).unreadCount).toBe(0);
    expect((await store(ownerB).inbox(page)).unreadCount).toBe(1);
  });
  it("removes unsafe action/image URLs from stored untrusted content", async () => {
    seed(ownerA, { data: { url: "javascript:alert(1)", imageUrl: "//other.test/x", spotId: "somewhere" } });
    seed(ownerA, { data: { url: "/\\attacker.test", imageUrl: "https://user:pass@other.test/x" } });
    const notices = (await store().inbox(page)).notifications;
    expect(notices.every(n => !n.data?.url && !n.data?.imageUrl)).toBe(true);
    seed(ownerA, { data: { url: "/itineraries/owned", imageUrl: "https://images.example.test/safe.jpg" } });
    expect((await store().inbox(page)).notifications.some(n => n.data?.url === "/itineraries/owned")).toBe(true);
  });
  it("refuses corrupt stored content instead of dropping into another store", async () => {
    seed(ownerA, { createdAt: "not-a-date" }); await expect(store().inbox(page)).rejects.toThrow();
  });
  it("maps corrupt stored JSON to the stable store error", async () => {
    seed(); db.sqlite.exec("PRAGMA ignore_check_constraints=ON; UPDATE auth_notifications SET data='broken'; PRAGMA ignore_check_constraints=OFF");
    await expect(store().inbox(page)).rejects.toThrow("Notification storage is unavailable.");
  });
  it("stores, repeats and rotates a device without exposing a sender or producer", async () => {
    const input = push(); await store().savePush(input); await store().savePush(input);
    const rotated = push(input.endpoint); await store().savePush(rotated);
    expect(rows("auth_push_subscriptions")).toHaveLength(1);
    expect(rows("auth_push_subscriptions")[0]).toMatchObject({ userId: ownerA, ...rotated.keys });
    expect(Object.getOwnPropertyNames(AuthNotificationStore.prototype).some(key => /send|createNotification|publish/i.test(key))).toBe(false);
  });
  it("refuses foreign endpoint takeover or deletion, including when owner B has free slots", async () => {
    const input = push(); await store().savePush(input); const before = rows("auth_push_subscriptions");
    await expect(store(ownerB).savePush(push(input.endpoint))).rejects.toThrow(PushRegistrationRefused);
    await store(ownerB).removePush(input.endpoint); await store(ownerB).removePush("https://push.example.test/missing");
    expect(rows("auth_push_subscriptions")).toEqual(before);
    await store().removePush(input.endpoint); expect(rows("auth_push_subscriptions")).toEqual([]);
  });
  it("atomically caps overlapping device registrations at ten and permits rotation at the cap", async () => {
    const inputs = Array.from({ length: 15 }, (_, i) => push(`https://push.example.test/device-${i}`));
    const results = await Promise.all(inputs.map(input => store().savePush(input).then(() => true, () => false)));
    expect(results.filter(Boolean)).toHaveLength(10); expect(rows("auth_push_subscriptions")).toHaveLength(10);
    const row = rows("auth_push_subscriptions")[0] as { endpoint: string }; await store().savePush(push(row.endpoint));
    expect(rows("auth_push_subscriptions")).toHaveLength(10);
  });
  it("lets one owner win overlapping claims for the same global endpoint", async () => {
    const input = push();
    const results = await Promise.all([store(), store(ownerB)].map(subject => subject.savePush(input).then(() => true, () => false)));
    expect(results.filter(Boolean)).toHaveLength(1); expect(rows("auth_push_subscriptions")).toHaveLength(1);
  });
  it("does not classify failed or malformed write results as a normal registration refusal", async () => {
    const input = push(), prepare = db.prepare.bind(db);
    for (const result of [{success: false, meta: {changes: 0}}, {meta: {changes: 0}},
      {success: true, meta: {changes: 2}}, {success: true, meta: {changes: -1}}]) {
      vi.spyOn(db, "prepare").mockImplementation(sql => {
        if (!sql.startsWith("INSERT INTO auth_push_subscriptions")) return prepare(sql);
        const statement = { bind: () => statement, run: async () => result };
        return statement as unknown as ReturnType<typeof db.prepare>;
      });
      await expect(store().savePush(input)).rejects.toThrow(NotificationStoreUnavailable);
      expect(rows("auth_push_subscriptions")).toEqual([]); vi.restoreAllMocks();
    }
  });
  it("refuses push creation and rotation if verification changes before the write", async () => {
    const input = push(); await store().savePush(input); const before = rows("auth_push_subscriptions"), prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation(sql => {
      if (sql.startsWith("INSERT INTO auth_push_subscriptions")) db.sqlite.exec(`UPDATE "user" SET emailVerified=0 WHERE id='${ownerA}'`);
      return prepare(sql);
    });
    await expect(store().savePush(push(input.endpoint))).rejects.toThrow();
    await expect(store().savePush(push("https://push.example.test/new"))).rejects.toThrow();
    expect(rows("auth_push_subscriptions")).toEqual(before);
  });
  it("cascades only the deleted canonical owner's feature rows", async () => {
    for (const id of [ownerA, ownerB]) {
      await store(id).updatePreferences({ social: true }); seed(id); await store(id).savePush(push(`https://push.example.test/${id}`));
    }
    db.sqlite.prepare('DELETE FROM "user" WHERE id=?').run(ownerA);
    for (const table of ["auth_notification_preferences", "auth_notifications", "auth_push_subscriptions"]) {
      expect(rows(table)).toHaveLength(1); expect(rows(table)[0]).toMatchObject({ userId: ownerB });
    }
    expect(db.sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  it("enforces foreign keys, enum/data/boolean limits independently of application code", () => {
    expect(() => db.sqlite.exec("INSERT INTO auth_notification_preferences(userId) VALUES ('absent')")).toThrow();
    seed();
    for (const sql of ["UPDATE auth_notifications SET isRead=2", "UPDATE auth_notifications SET type='invented'",
      "UPDATE auth_notifications SET data='[]'", "UPDATE auth_notifications SET data='broken'",
      "UPDATE auth_notifications SET title=''"]) expect(() => db.sqlite.exec(sql)).toThrow();
  });
});

describe("bounded notification input", () => {
  it.each([{}, [], null, { clerkUserId: ownerB }, { userId: ownerB }, { system: 1 }, { system: "true" },
    { quietHoursStart: "25:00" }, { timezone: "imaginary/zone" }, { emailEnabled: true, unknown: true }])("refuses invalid preferences %j", value => {
    expect(parsePreferencePatch(value)).toBeNull();
  });
  it.each(["limit=0", "limit=51", "limit=2.0", "offset=-1", "offset=1001", "offset=01", "unreadOnly=yes", "limit=1&limit=2"])("refuses page %s", query => {
    expect(parseNotificationPage(new URLSearchParams(query))).toBeNull();
  });
  it("accepts exact bounded paging and refuses bypass through the store API", async () => {
    expect(parseNotificationPage(new URLSearchParams())).toEqual(page);
    expect(parseNotificationPage(new URLSearchParams("limit=50&offset=1000&unreadOnly=true"))).toEqual({ limit: 50, offset: 1000, unreadOnly: true });
    await expect(store().inbox({ ...page, limit: 100000 })).rejects.toThrow();
    await expect(store().markRead("bad-id")).rejects.toThrow();
  });
  it("validates real curve points, canonical keys and exact push fields", async () => {
    const good = push(), invalidPoint = Buffer.alloc(65); invalidPoint[0] = 4;
    for (const sub of [{ ...good, endpoint: "http://push.example.test/x" }, { ...good, endpoint: "https://user:pass@push.example.test/x" },
      { ...good, endpoint: "https://push.example.test/x#secret" }, { ...good, endpoint: " https://push.example.test/x" },
      { ...good, keys: { ...good.keys, p256dh: invalidPoint.toString("base64url") } },
      { ...good, keys: { ...good.keys, auth: good.keys.auth + "=" } }, { ...good, expirationTime: 10 }]) {
      expect(await parsePushSubscription({ subscription: sub })).toBeNull();
      await expect(store().savePush(sub)).rejects.toThrow();
    }
    expect(await parsePushSubscription({ subscription: good, ownerId: ownerB })).toBeNull();
    expect(await parsePushSubscription({ subscription: { ...good, expirationTime: null } })).toEqual(good);
    expect(rows("auth_push_subscriptions")).toEqual([]);
  });
  it("bounds bytes, not claimed content length, and refuses malformed/non-UTF8 data", async () => {
    for (const body of ["{", " ".repeat(8193), new Uint8Array([0xff])]) {
      const request = new Request("https://www.localley.io/api/notifications", { method: "POST", body, headers: { "Content-Length": "1" } });
      expect(await readNotificationBody(request)).toBeNull();
    }
    expect(await readNotificationBody(new Request("https://www.localley.io", { method: "POST", body: '{"system":true}' }))).toEqual({ system: true });
  });
});

import "server-only";
import type { Notification, NotificationPreferences, NotificationType } from "@/types";
import { isObject, notificationId, parseNotificationPage, parsePreferencePatch, parsePushEndpoint,
  parsePushSubscription, preferenceFlags, validQuietTime, validTimezone,
  type NotificationPage, type PreferencePatch, type StoredPushInput } from "./validation";

// A narrow D1 port also permits tests against the real SQLite engine.
export interface NotificationStatement {
  bind(...values: (string | number | null)[]): NotificationStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success?: boolean; meta: { changes: number } }>;
}
export interface NotificationDatabase { prepare(sql: string): NotificationStatement }
export class NotificationStoreUnavailable extends Error {
  constructor() { super("Notification storage is unavailable."); }
}
export class PushRegistrationRefused extends Error {
  constructor() { super("Push registration refused."); }
}
type PreferenceRow = Record<typeof preferenceFlags[number], number> & {
  userId: string; quietHoursStart: string | null; quietHoursEnd: string | null; timezone: string;
};
type InboxRow = { id: string; type: string; title: string; message: string; data: string;
  isRead: number; readAt: string | null; createdAt: string };
const types: NotificationType[] = ["achievement", "level_up", "new_spot", "itinerary_shared",
  "itinerary_liked", "review_helpful", "friend_request", "friend_accepted", "challenge_start",
  "challenge_ending", "weekly_digest", "system"];
const verified = `EXISTS (SELECT 1 FROM "user" u WHERE u.id = ? AND u.emailVerified = 1)`;

function preferences(row: PreferenceRow, userId: string): NotificationPreferences {
  if (row.userId !== userId || preferenceFlags.some(key => ![0, 1].includes(row[key]))
    || !validQuietTime(row.quietHoursStart) || !validQuietTime(row.quietHoursEnd) || !validTimezone(row.timezone)) {
    throw new NotificationStoreUnavailable();
  }
  return { clerkUserId: userId,
    ...Object.fromEntries(preferenceFlags.map(key => [key, row[key] === 1])) as Record<typeof preferenceFlags[number], boolean>,
    quietHoursStart: row.quietHoursStart ?? undefined, quietHoursEnd: row.quietHoursEnd ?? undefined, timezone: row.timezone };
}
function safeLink(value: unknown, relative: boolean): boolean {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\s\x00-\x1f\x7f\\]/.test(value)) return false;
  if (relative && value.startsWith("/") && !value.startsWith("//")) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}
function notification(row: InboxRow, userId: string): Notification {
  if (!notificationId(row.id) || !types.includes(row.type as NotificationType)
    || typeof row.title !== "string" || !row.title || row.title.length > 200
    || typeof row.message !== "string" || !row.message || row.message.length > 2000
    || ![0, 1].includes(row.isRead) || !Number.isFinite(Date.parse(row.createdAt))
    || (row.readAt !== null && !Number.isFinite(Date.parse(row.readAt)))
    || typeof row.data !== "string" || row.data.length > 8192) throw new NotificationStoreUnavailable();
  let data: unknown;
  try { data = JSON.parse(row.data) as unknown; }
  catch { throw new NotificationStoreUnavailable(); }
  if (!isObject(data)) throw new NotificationStoreUnavailable();
  // Notification links are content, never trusted navigation or image sources.
  if ("url" in data && !safeLink(data.url, true)) delete data.url;
  if ("imageUrl" in data && !safeLink(data.imageUrl, false)) delete data.imageUrl;
  return { id: row.id, clerkUserId: userId, type: row.type as NotificationType, title: row.title,
    message: row.message, data, read: row.isRead === 1, readAt: row.readAt ?? undefined, createdAt: row.createdAt };
}
async function endpointHash(endpoint: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

/** Request-scoped store. Caller supplies only the verified session's canonical user.id.
 * Every SQL operation rechecks the physical verified user; no email/prefix/Source owner mapping.
 * No sender, public notification producer, Source fallback, or delivery hooks are exposed here.
 */
export class AuthNotificationStore {
  constructor(private readonly db: NotificationDatabase, private readonly userId: string) {
    if (typeof userId !== "string" || !userId || userId.length > 200) throw new NotificationStoreUnavailable();
  }
  private async assertOwner(): Promise<void> {
    const row = await this.db.prepare(`SELECT id FROM "user" WHERE id = ? AND emailVerified = 1`)
      .bind(this.userId).first<{ id: string }>();
    if (row?.id !== this.userId) throw new NotificationStoreUnavailable();
  }
  async getPreferences(): Promise<NotificationPreferences> {
    const row = await this.db.prepare(`SELECT u.id AS userId,
      ${preferenceFlags.map(key => `coalesce(p.${key}, 0) AS ${key}`).join(", ")},
      p.quietHoursStart, p.quietHoursEnd, coalesce(p.timezone, 'UTC') AS timezone
      FROM "user" u LEFT JOIN auth_notification_preferences p ON p.userId = u.id
      WHERE u.id = ? AND u.emailVerified = 1`).bind(this.userId).first<PreferenceRow>();
    if (!row) throw new NotificationStoreUnavailable();
    return preferences(row, this.userId);
  }
  async updatePreferences(input: PreferencePatch): Promise<NotificationPreferences> {
    const patch = parsePreferencePatch(input);
    if (!patch) throw new NotificationStoreUnavailable();
    // Columns come only from the exact allowlist. One UPSERT preserves concurrent partial patches.
    const keys = Object.keys(patch) as (keyof PreferencePatch)[];
    const values = keys.map(key => typeof patch[key] === "boolean" ? Number(patch[key]) : patch[key] ?? null);
    const row = await this.db.prepare(`INSERT INTO auth_notification_preferences(userId, ${keys.join(", ")})
      SELECT ?, ${keys.map(() => "?").join(", ")} WHERE ${verified}
      ON CONFLICT(userId) DO UPDATE SET ${keys.map(key => `${key} = excluded.${key}`).join(", ")}
      WHERE ${verified} RETURNING *`).bind(this.userId, ...values, this.userId, this.userId).first<PreferenceRow>();
    if (!row) throw new NotificationStoreUnavailable();
    return preferences(row, this.userId);
  }
  async inbox(page: NotificationPage) {
    if (!page || !parseNotificationPage(new URLSearchParams({ limit: String(page.limit), offset: String(page.offset),
      unreadOnly: String(page.unreadOnly) }))) throw new NotificationStoreUnavailable();
    await this.assertOwner();
    const [rows, count] = await Promise.all([
      this.db.prepare(`SELECT n.id, n.type, n.title, n.message, n.data, n.isRead, n.readAt, n.createdAt
        FROM auth_notifications n JOIN "user" u ON u.id = n.userId AND u.emailVerified = 1
        WHERE n.userId = ? AND (? = 0 OR n.isRead = 0)
        ORDER BY n.createdAt DESC, n.id DESC LIMIT ? OFFSET ?`)
        .bind(this.userId, Number(page.unreadOnly), page.limit + 1, page.offset).all<InboxRow>(),
      this.db.prepare(`SELECT count(*) AS n FROM auth_notifications n
        JOIN "user" u ON u.id = n.userId AND u.emailVerified = 1 WHERE n.userId = ? AND n.isRead = 0`)
        .bind(this.userId).first<{ n: number }>(),
    ]);
    if (!Array.isArray(rows.results) || rows.results.length > page.limit + 1
      || !count || !Number.isSafeInteger(count.n) || count.n < 0) throw new NotificationStoreUnavailable();
    return { notifications: rows.results.slice(0, page.limit).map(row => notification(row, this.userId)),
      unreadCount: count.n, hasMore: rows.results.length > page.limit };
  }
  async markRead(id?: string): Promise<boolean> {
    if (id !== undefined && !notificationId(id)) throw new NotificationStoreUnavailable();
    await this.assertOwner();
    // Matching an already-read owned row is a successful, idempotent operation.
    const result = await this.db.prepare(`UPDATE auth_notifications SET isRead = 1, readAt = coalesce(readAt, ?)
      WHERE userId = ? ${id === undefined ? "" : "AND id = ?"} AND ${verified}`)
      .bind(new Date().toISOString(), this.userId, ...(id === undefined ? [] : [id]), this.userId).run();
    return id === undefined || result.meta.changes === 1;
  }
  async delete(id: string): Promise<boolean> {
    if (!notificationId(id)) throw new NotificationStoreUnavailable();
    await this.assertOwner();
    const result = await this.db.prepare(`DELETE FROM auth_notifications WHERE userId = ? AND id = ? AND ${verified}`)
      .bind(this.userId, id, this.userId).run();
    return result.meta.changes === 1;
  }
  async savePush(input: StoredPushInput): Promise<void> {
    const checked = await parsePushSubscription({ subscription: input });
    if (!checked) throw new NotificationStoreUnavailable();
    const hash = await endpointHash(checked.endpoint);
    // The cap and endpoint ownership checks share the atomic statement, including key rotation.
    const result = await this.db.prepare(`INSERT INTO auth_push_subscriptions(endpointSha256, userId, endpoint, p256dh, auth)
      SELECT ?, ?, ?, ?, ? WHERE ${verified}
      AND ((SELECT count(*) FROM auth_push_subscriptions WHERE userId = ?) < 10
        OR EXISTS (SELECT 1 FROM auth_push_subscriptions WHERE userId = ? AND endpointSha256 = ?))
      ON CONFLICT(endpointSha256) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
      WHERE auth_push_subscriptions.userId = excluded.userId AND auth_push_subscriptions.endpoint = excluded.endpoint
      AND ${verified}`).bind(hash, this.userId, checked.endpoint, checked.keys.p256dh, checked.keys.auth,
        this.userId, this.userId, this.userId, hash, this.userId).run();
    if (result.success !== true) throw new NotificationStoreUnavailable();
    if (result.meta.changes === 0) throw new PushRegistrationRefused();
    if (result.meta.changes !== 1) throw new NotificationStoreUnavailable();
  }
  async removePush(endpoint: string): Promise<void> {
    if (!parsePushEndpoint(endpoint)) throw new NotificationStoreUnavailable();
    await this.assertOwner();
    await this.db.prepare(`DELETE FROM auth_push_subscriptions WHERE userId = ? AND endpointSha256 = ?
      AND endpoint = ? AND ${verified}`).bind(this.userId, await endpointHash(endpoint), endpoint, this.userId).run();
  }
}

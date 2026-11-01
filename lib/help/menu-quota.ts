import "server-only";
import { appDataDb } from "@/lib/app-data/backend";
import { MENU_GLOBAL_DAILY_LIMIT, MENU_USER_DAILY_LIMIT } from "@/lib/help/menu";

/**
 * Daily caps for menu scans (helper 2), in the existing legacy_usage counter table (no new table).
 * One row per user per UTC day, plus one row for all users under a system owner id. The rows are D1-only data and
 * do not go to the Supabase rollback journal (Postgres usage_tracking has a CHECK on usage_type).
 * Fail closed: a D1 error refuses the scan.
 */
export const MENU_USAGE_TYPE = "help_menu_scans";
export const MENU_GLOBAL_OWNER = "system:help-menu";

type Statement = { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<unknown> };
export type QuotaDb = { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> };

export type MenuReservation = { status: "ok"; remaining: number } | { status: "user_limit" | "global_limit" | "unavailable" };

const reserve = (db: QuotaDb, owner: string, day: string, limit: number) =>
  db.prepare(
    `INSERT INTO legacy_usage (id, ownerId, usageType, periodStart, periodType, count, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'daily', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT (ownerId, usageType, periodStart, periodType) DO UPDATE SET count = legacy_usage.count + 1,
       updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE legacy_usage.count < ?
     RETURNING count`,
  ).bind(crypto.randomUUID(), owner, MENU_USAGE_TYPE, day, limit).first<{ count: number }>();

const release = (db: QuotaDb, owner: string, day: string) =>
  db.prepare(`UPDATE legacy_usage SET count = MAX(count - 1, 0) WHERE ownerId = ? AND usageType = ? AND periodStart = ? AND periodType = 'daily'`)
    .bind(owner, MENU_USAGE_TYPE, day).run();

/** Reserves one scan: global cap first, then the user's own; a user denial gives the global slot back. */
export async function reserveMenuScan(userId: string, db: QuotaDb = appDataDb() as unknown as QuotaDb, now = new Date()): Promise<MenuReservation> {
  const day = now.toISOString().slice(0, 10);
  try {
    await db.batch([
      db.prepare("INSERT INTO owners (id, source) VALUES (?, 'new') ON CONFLICT (id) DO NOTHING").bind(MENU_GLOBAL_OWNER),
      db.prepare("INSERT INTO owners (id, source) VALUES (?, 'new') ON CONFLICT (id) DO NOTHING").bind(userId),
    ]);
    if (!(await reserve(db, MENU_GLOBAL_OWNER, day, MENU_GLOBAL_DAILY_LIMIT))) return { status: "global_limit" };
    const mine = await reserve(db, userId, day, MENU_USER_DAILY_LIMIT);
    if (!mine) {
      await release(db, MENU_GLOBAL_OWNER, day);
      return { status: "user_limit" };
    }
    return { status: "ok", remaining: Math.max(0, MENU_USER_DAILY_LIMIT - mine.count) };
  } catch (error) {
    console.error("[help-menu] quota unavailable:", error instanceof Error ? error.message : "unknown");
    return { status: "unavailable" };
  }
}

/** Gives the user's scan back when the model failed (the global slot stays used: the call may have cost money). */
export async function releaseMenuScan(userId: string, db: QuotaDb = appDataDb() as unknown as QuotaDb, now = new Date()): Promise<void> {
  try {
    await release(db, userId, now.toISOString().slice(0, 10));
  } catch {
    console.error("[help-menu] quota release failed");
  }
}

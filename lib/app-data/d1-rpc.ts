import "server-only";
import type { PreviewAppDataReader } from "./preview-db";
import { nowTimestamptz, usageCheck, type PostgrestResult } from "./d1-postgrest";

/**
 * D1 versions of Postgres functions called through `supabase.rpc()` (Supabase exit step 3). Each returns what
 * PostgREST returns for the function: a set-returning function -> array of rows, a scalar -> the value.
 */

type Args = Record<string, unknown>;

/** Postgres CURRENT_DATE (UTC on Supabase) truncated like the functions do: day, ISO week (Monday) or month. */
export function periodStart(periodType: unknown, now = new Date()): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (periodType === "daily") return day.toISOString().slice(0, 10);
  if (periodType === "weekly") {
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day.toISOString().slice(0, 10);
  }
  return `${day.toISOString().slice(0, 7)}-01`;
}

function text(args: Args, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || !value) throw new Error(`D1 rpc: ${name} must be text`);
  return value;
}

function integer(args: Args, name: string, fallback?: number): number {
  const value = args[name] ?? fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`D1 rpc: ${name} must be an integer`);
  return value;
}

/**
 * check_and_increment_usage_weighted: the limit check and the increment are ONE statement (D1 runs each statement
 * atomically), which replaces the pg_advisory_xact_lock. Denied -> no write, current count returned.
 */
async function checkAndIncrementUsageWeighted(db: PreviewAppDataReader, args: Args) {
  const owner = text(args, "p_clerk_user_id"), usageType = text(args, "p_usage_type"), periodType = text(args, "p_period_type");
  const limit = integer(args, "p_limit"), amount = integer(args, "p_amount", 1);
  const start = periodStart(periodType), now = nowTimestamptz();
  const [, upsert] = await db.batch([
    db.prepare("INSERT INTO owners (id, source) VALUES (?, 'new') ON CONFLICT (id) DO NOTHING").bind(owner),
    db.prepare(`INSERT INTO legacy_usage (id, ownerId, usageType, periodStart, periodType, count, createdAt, updatedAt)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ? <= ?
      ON CONFLICT (ownerId, usageType, periodStart, periodType) DO UPDATE SET count = legacy_usage.count + excluded.count, updatedAt = excluded.updatedAt
      WHERE legacy_usage.count + excluded.count <= ?
      RETURNING count`).bind(crypto.randomUUID(), owner, usageType, start, periodType, amount, now, now, amount, limit, limit),
  ]);
  const written = upsert.results?.[0] as { count?: number } | undefined;
  if (typeof written?.count === "number") return [{ allowed: true, new_count: written.count, was_at_limit: false }];
  const current = await db.prepare("SELECT count FROM legacy_usage WHERE ownerId = ? AND usageType = ? AND periodType = ? AND periodStart = ?")
    .bind(owner, usageType, periodType, start).first<{ count: number }>();
  const count = current?.count ?? 0;
  return [{ allowed: false, new_count: count, was_at_limit: count >= limit }];
}

/** increment_usage: unconditional +1 upsert, returns the new count. */
async function incrementUsage(db: PreviewAppDataReader, args: Args) {
  const owner = text(args, "p_clerk_user_id"), usageType = text(args, "p_usage_type");
  const periodType = typeof args.p_period_type === "string" ? args.p_period_type : "monthly";
  const now = nowTimestamptz();
  const [, upsert] = await db.batch([
    db.prepare("INSERT INTO owners (id, source) VALUES (?, 'new') ON CONFLICT (id) DO NOTHING").bind(owner),
    db.prepare(`INSERT INTO legacy_usage (id, ownerId, usageType, periodStart, periodType, count, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT (ownerId, usageType, periodStart, periodType) DO UPDATE SET count = legacy_usage.count + 1, updatedAt = excluded.updatedAt
      RETURNING count`).bind(crypto.randomUUID(), owner, usageType, periodStart(periodType), periodType, now, now),
  ]);
  return (upsert.results?.[0] as { count: number }).count;
}

export const D1_RPCS: Record<string, (db: PreviewAppDataReader, args: Args) => Promise<unknown>> = {
  check_and_increment_usage_weighted: checkAndIncrementUsageWeighted,
  increment_usage: incrementUsage,
};

/** PostgREST-shaped rpc() result. Only the service role calls these functions today. */
export async function d1Rpc(db: PreviewAppDataReader, name: string, args: Args = {}): Promise<PostgrestResult<unknown>> {
  const fn = D1_RPCS[name];
  if (!fn) throw new Error(`D1 rpc: function ${name} is not migrated`);
  const violated = usageCheck(args.p_usage_type, args.p_period_type ?? "monthly");
  if (violated) {
    return { data: null, error: { code: "23514", message: `new row for relation "usage_tracking" violates check constraint "${violated}"`, details: null, hint: null }, count: null, status: 400 };
  }
  return { data: await fn(db, args), error: null, count: null, status: 200 };
}

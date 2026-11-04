import "server-only";
import { appDataDb } from "@/lib/app-data/backend";

/**
 * Hard stops for Google Places API calls (NEEDS 880): every server-side Places request reserves one call first.
 * Monthly: 4,500 calls a UTC month. Place Photos are USD 7 / 1,000 after 1,000 free a month, so the worst case is
 * (4,500 - 1,000) x 7 / 1,000 = USD 24.50, inside the USD 25 Places budget (Nils 2026-11-03, APPROVALS line 150).
 * Daily: 600 calls, so one busy day cannot use the month. PLACES_DAILY_CAP / PLACES_MONTHLY_CAP vars can lower or
 * change them. A host cron alerts at 80 % from the same rows (places_api_usage).
 */
export const PLACES_DAILY_CAP_DEFAULT = 600;
export const PLACES_MONTHLY_CAP_DEFAULT = 4500;

type QuotaDb = { prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } } };

export function placesDailyCap(): number {
  const cap = Number(process.env.PLACES_DAILY_CAP);
  return Number.isSafeInteger(cap) && cap > 0 ? cap : PLACES_DAILY_CAP_DEFAULT;
}

export function placesMonthlyCap(): number {
  const cap = Number(process.env.PLACES_MONTHLY_CAP);
  return Number.isSafeInteger(cap) && cap > 0 ? cap : PLACES_MONTHLY_CAP_DEFAULT;
}

/** First day of the UTC month and of the next one, as YYYY-MM-DD. */
function monthRange(now: Date): [string, string] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return [start.toISOString().slice(0, 10), next.toISOString().slice(0, 10)];
}

/**
 * True when a call may go to Google. One atomic upsert: it counts only while the day is below the daily cap and the
 * month is below the monthly cap, so concurrent requests can never pass either cap. Fail closed: a missing binding or
 * a D1 error refuses the call.
 */
export async function reservePlacesCall(kind: string, db?: QuotaDb, now = new Date()): Promise<boolean> {
  const cap = placesDailyCap();
  const monthCap = placesMonthlyCap();
  const [monthStart, nextMonth] = monthRange(now);
  const monthUsed = "(SELECT COALESCE(SUM(calls), 0) FROM places_api_usage WHERE day >= ?4 AND day < ?5)";
  try {
    const row = await (db ?? (appDataDb() as unknown as QuotaDb)).prepare(
      `INSERT INTO places_api_usage (day, calls, cap) SELECT ?1, 1, ?2 WHERE ${monthUsed} < ?3
       ON CONFLICT(day) DO UPDATE SET calls = calls + 1, cap = excluded.cap, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE places_api_usage.calls < excluded.cap AND ${monthUsed} < ?3
       RETURNING calls`,
    ).bind(now.toISOString().slice(0, 10), cap, monthCap, monthStart, nextMonth).first<{ calls: number }>();
    if (!row) console.warn(`[places-quota] daily cap ${cap} or monthly cap ${monthCap} reached, ${kind} refused`);
    return Boolean(row);
  } catch (error) {
    console.error(`[places-quota] counter unavailable, ${kind} refused:`, error instanceof Error ? error.message : "unknown");
    return false;
  }
}

import "server-only";
import { appDataDb } from "@/lib/app-data/backend";

/**
 * Hard daily stop for Google Places API calls (NEEDS 880): every server-side Places request reserves one call first.
 * Default 300/day (about 1.7x normal use on 2026-10-27: ~175 photo + ~35 search/details calls a day); the
 * PLACES_DAILY_CAP var can change it. A host cron alerts at 80 % from the same row (places_api_usage).
 */
export const PLACES_DAILY_CAP_DEFAULT = 300;

type QuotaDb = { prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } } };

export function placesDailyCap(): number {
  const cap = Number(process.env.PLACES_DAILY_CAP);
  return Number.isSafeInteger(cap) && cap > 0 ? cap : PLACES_DAILY_CAP_DEFAULT;
}

/**
 * True when a call may go to Google. One atomic upsert: it counts only while calls < cap, so concurrent requests can
 * never pass the cap. Fail closed: a missing binding or a D1 error refuses the call.
 */
export async function reservePlacesCall(kind: string, db?: QuotaDb, now = new Date()): Promise<boolean> {
  const cap = placesDailyCap();
  try {
    const row = await (db ?? (appDataDb() as unknown as QuotaDb)).prepare(
      `INSERT INTO places_api_usage (day, calls, cap) VALUES (?, 1, ?)
       ON CONFLICT(day) DO UPDATE SET calls = calls + 1, cap = excluded.cap, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE places_api_usage.calls < excluded.cap
       RETURNING calls`,
    ).bind(now.toISOString().slice(0, 10), cap).first<{ calls: number }>();
    if (!row) console.warn(`[places-quota] daily cap ${cap} reached, ${kind} refused`);
    return Boolean(row);
  } catch (error) {
    console.error(`[places-quota] counter unavailable, ${kind} refused:`, error instanceof Error ? error.message : "unknown");
    return false;
  }
}

import "server-only";
import type { SpotEvent } from "@/lib/spot-analytics";

// Daily aggregate store for spot-card events (migrations/auth/0005_spot_card_events.sql).
// Bounded: at most MAX_BATCH distinct rows per request and DAILY_LIMIT increments per UTC day.

export const SPOT_EVENTS: readonly SpotEvent[] = ["card_view", "save", "add_to_trip", "open_detail", "directions"];
export const MAX_BATCH = 25;
export const DAILY_LIMIT = 50_000;
const SPOT_ID = /^[a-zA-Z0-9_-]{1,128}$/;

interface Statement { bind(...values: unknown[]): Statement; first<T>(): Promise<T | null> }
export interface SpotEventDatabase { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }

export interface SpotEventCount { event: SpotEvent; spotId: string; count: number }

/** Validates and merges a client batch; returns null when the payload is not acceptable. */
export function parseSpotEvents(body: unknown): SpotEventCount[] | null {
    const list = (body as { events?: unknown })?.events;
    if (!Array.isArray(list) || list.length === 0 || list.length > 100) return null;
    const merged = new Map<string, SpotEventCount>();
    for (const item of list) {
        const event = (item as { event?: unknown })?.event;
        const spotId = (item as { spot_id?: unknown })?.spot_id;
        if (!SPOT_EVENTS.includes(event as SpotEvent) || typeof spotId !== "string" || !SPOT_ID.test(spotId)) return null;
        const key = `${event}:${spotId}`;
        const row = merged.get(key) ?? { event: event as SpotEvent, spotId, count: 0 };
        row.count = Math.min(row.count + 1, 20);
        merged.set(key, row);
    }
    return merged.size > MAX_BATCH ? null : [...merged.values()];
}

export function spotEventDatabase(): SpotEventDatabase | undefined {
    const context = (globalThis as Record<symbol, { env?: { AUTH_DB?: SpotEventDatabase } } | undefined>)
        [Symbol.for("__cloudflare-context__")];
    return context?.env?.AUTH_DB;
}

/** "stored" | "limited" (daily ceiling reached) | "unavailable" (no D1 or a D1 error). */
export async function recordSpotEvents(
    rows: SpotEventCount[],
    db: SpotEventDatabase | undefined = spotEventDatabase(),
    now = new Date(),
): Promise<"stored" | "limited" | "unavailable"> {
    if (!db) return "unavailable";
    const day = now.toISOString().slice(0, 10);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    try {
        const budget = await db.prepare(`INSERT INTO spot_card_events_budget (day, total) VALUES (?, ?)
            ON CONFLICT(day) DO UPDATE SET total = spot_card_events_budget.total + excluded.total
            WHERE spot_card_events_budget.total + excluded.total <= ${DAILY_LIMIT}
            RETURNING total`).bind(day, total).first<{ total: number }>();
        if (!budget) return "limited";
        await db.batch(rows.map((row) => db.prepare(`INSERT INTO spot_card_events_daily (day, event, spotId, count)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(day, event, spotId) DO UPDATE SET count = spot_card_events_daily.count + excluded.count`)
            .bind(day, row.event, row.spotId, row.count)));
        return "stored";
    } catch {
        return "unavailable";
    }
}

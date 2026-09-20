import { LUNA_MODEL, type LunaReceipt } from "./luna";

// Restricted preview caps. Every attempted call counts, including unknown outcomes.
export const AI_OWNER_DAILY_LIMIT = 20;
export const AI_GLOBAL_DAILY_LIMIT = 100;

export async function reserveAIRequest(db: D1Database, ownerId: string, purpose: "chat" | "itinerary" = "chat"): Promise<string | null> {
  const id = crypto.randomUUID();
  // Both limits and insertion are one statement: concurrent isolates cannot overspend the last slot.
  const row = await db.prepare(`INSERT INTO native_ai_requests (id, owner_id, day, model, purpose)
    SELECT ?, ?, strftime('%Y-%m-%d','now'), ?, ?
    WHERE (SELECT count(*) FROM native_ai_requests WHERE day = strftime('%Y-%m-%d','now')) < ?
    AND (SELECT count(*) FROM native_ai_requests WHERE day = strftime('%Y-%m-%d','now') AND owner_id = ?) < ?
    RETURNING id`).bind(id, ownerId, LUNA_MODEL, purpose, AI_GLOBAL_DAILY_LIMIT, ownerId, AI_OWNER_DAILY_LIMIT)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function settleAIRequest(db: D1Database, id: string, ownerId: string, completed: boolean, receipt?: LunaReceipt): Promise<void> {
  await db.prepare(`UPDATE native_ai_requests SET state = ?, response_id = ?, provider_status = ?, input_tokens = ?, output_tokens = ?, cached_input_tokens = ?
    WHERE id = ? AND owner_id = ? AND state = 'reserved'`)
    .bind(completed ? "completed" : "unknown", receipt?.responseId ?? null, receipt?.providerStatus ?? null,
      receipt?.inputTokens ?? null, receipt?.outputTokens ?? null, receipt?.cachedInputTokens ?? null, id, ownerId).run();
}

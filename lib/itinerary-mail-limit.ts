import "server-only";

interface MailLimitDatabase {
  prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null> } };
}

/** Reserve before dispatch. Failed/ambiguous sends still consume the reservation. */
export async function reserveItineraryMail(userId: string): Promise<"allowed" | "limited" | "unavailable"> {
  const context = (globalThis as Record<symbol, { env?: { AUTH_DB?: MailLimitDatabase } } | undefined>)
    [Symbol.for("__cloudflare-context__")];
  if (!context?.env?.AUTH_DB) return "unavailable";
  const now = Date.now();
  const hour = Math.floor(now / 3_600_000) * 3_600_000;
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  try {
    const row = await context.env.AUTH_DB.prepare(`INSERT INTO itinerary_mail_limits
      (userId,hourStart,hourCount,dayStart,dayCount) VALUES (?, ?, 1, ?, 1)
      ON CONFLICT(userId) DO UPDATE SET
        hourStart=excluded.hourStart,
        hourCount=CASE WHEN itinerary_mail_limits.hourStart<excluded.hourStart THEN 1 ELSE itinerary_mail_limits.hourCount+1 END,
        dayStart=excluded.dayStart,
        dayCount=CASE WHEN itinerary_mail_limits.dayStart<excluded.dayStart THEN 1 ELSE itinerary_mail_limits.dayCount+1 END
      WHERE (itinerary_mail_limits.hourStart<excluded.hourStart
          OR (itinerary_mail_limits.hourStart=excluded.hourStart AND itinerary_mail_limits.hourCount<5))
        AND (itinerary_mail_limits.dayStart<excluded.dayStart
          OR (itinerary_mail_limits.dayStart=excluded.dayStart AND itinerary_mail_limits.dayCount<20))
      RETURNING userId`).bind(userId, hour, day).first<{ userId: string }>();
    if (row?.userId !== userId) return "limited";
    // Reserve the shared cap only after the owner passes. A later refusal keeps
    // the owner's reservation; it cannot cause an uncharged or duplicate send.
    const global = await context.env.AUTH_DB.prepare(`INSERT INTO itinerary_mail_global_limit
      (id,hourStart,hourCount,dayStart,dayCount) VALUES (1, ?, 1, ?, 1)
      ON CONFLICT(id) DO UPDATE SET
        hourStart=excluded.hourStart,
        hourCount=CASE WHEN itinerary_mail_global_limit.hourStart<excluded.hourStart THEN 1 ELSE itinerary_mail_global_limit.hourCount+1 END,
        dayStart=excluded.dayStart,
        dayCount=CASE WHEN itinerary_mail_global_limit.dayStart<excluded.dayStart THEN 1 ELSE itinerary_mail_global_limit.dayCount+1 END
      WHERE (itinerary_mail_global_limit.hourStart<excluded.hourStart
          OR (itinerary_mail_global_limit.hourStart=excluded.hourStart AND itinerary_mail_global_limit.hourCount<10))
        AND (itinerary_mail_global_limit.dayStart<excluded.dayStart
          OR (itinerary_mail_global_limit.dayStart=excluded.dayStart AND itinerary_mail_global_limit.dayCount<40))
      RETURNING id`).bind(hour, day).first<{ id: number }>();
    return global?.id === 1 ? "allowed" : "limited";
  } catch { return "unavailable"; }
}

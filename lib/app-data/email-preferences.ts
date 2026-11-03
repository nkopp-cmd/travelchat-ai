import "server-only";
import type { PreviewAppDataReader } from "./preview-db";
import type { PreviewEmailPreferences } from "./preview-email-preferences";

/**
 * Production email preferences on D1 (DATA_BACKEND=d1). Supabase `users` never had an email_preferences column,
 * so there is nothing to import: a user without a row gets the defaults. Owner id = the auth user id, as in the
 * facade. D1-only table (no Supabase counterpart), so no _journal row.
 */
const defaults: PreviewEmailPreferences = {
  marketing: true, weekly_digest: true, product_updates: true, itinerary_shared: true,
};
const keys = ["marketing", "weekly_digest", "product_updates", "itinerary_shared"] as const;
type Row = Record<typeof keys[number], number>;

export async function readEmailPreferences(db: PreviewAppDataReader, userId: string): Promise<PreviewEmailPreferences> {
  const row = await db.prepare(`SELECT marketing, weekly_digest, product_updates, itinerary_shared
    FROM email_preferences WHERE ownerId = ?`).bind(userId).first<Row>();
  if (!row) return { ...defaults };
  return Object.fromEntries(keys.map(key => [key, row[key] === 1])) as unknown as PreviewEmailPreferences;
}

export async function writeEmailPreferences(db: PreviewAppDataReader, userId: string,
  patch: Partial<PreviewEmailPreferences>): Promise<PreviewEmailPreferences> {
  await db.batch([
    db.prepare("INSERT INTO owners (id, source) VALUES (?, 'new') ON CONFLICT (id) DO NOTHING").bind(userId),
    db.prepare(`INSERT INTO email_preferences (ownerId, marketing, weekly_digest, product_updates, itinerary_shared)
      VALUES (?, 1, 1, 1, 1) ON CONFLICT (ownerId) DO NOTHING`).bind(userId),
    db.prepare(`UPDATE email_preferences SET
      marketing = coalesce(?, marketing), weekly_digest = coalesce(?, weekly_digest),
      product_updates = coalesce(?, product_updates), itinerary_shared = coalesce(?, itinerary_shared)
      WHERE ownerId = ?`).bind(...keys.map(key => patch[key] === undefined ? null : Number(patch[key])), userId),
  ]);
  return readEmailPreferences(db, userId);
}

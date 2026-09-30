import "server-only";
import type { NextRequest } from "next/server";
import { ensureOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

export interface PreviewEmailPreferences {
  marketing: boolean;
  weekly_digest: boolean;
  product_updates: boolean;
  itinerary_shared: boolean;
}

const defaults: PreviewEmailPreferences = {
  marketing: true, weekly_digest: true, product_updates: true, itinerary_shared: true,
};
const keys = ["marketing", "weekly_digest", "product_updates", "itinerary_shared"] as const;
interface PreferenceRow { marketing: number; weekly_digest: number; product_updates: number; itinerary_shared: number }

export function isPreviewEmailPreferencesCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

export function parsePreviewEmailPreferencePatch(value: unknown): Partial<PreviewEmailPreferences> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const patch = value as Record<string, unknown>;
  const given = Object.keys(patch);
  if (!given.length || given.some(key => !keys.includes(key as typeof keys[number]) || typeof patch[key] !== "boolean")) {
    return null;
  }
  return patch as Partial<PreviewEmailPreferences>;
}

function parseRow(row: PreferenceRow): PreviewEmailPreferences {
  if (!row || keys.some(key => row[key] !== 0 && row[key] !== 1)) {
    throw new Error("Invalid preview email preferences");
  }
  return Object.fromEntries(keys.map(key => [key, row[key] === 1])) as unknown as PreviewEmailPreferences;
}

/** A legacy owner without imported preferences must not silently receive defaults. */
export async function previewEmailPreferences(userId: string): Promise<PreviewEmailPreferences> {
  const owners = await ownerIds(userId);
  if (owners.legacy && owners.fresh) throw new Error("Conflicting preview preference owner");
  const ownerId = owners.legacy ?? owners.fresh;
  if (!ownerId) return { ...defaults };
  const row = await previewAppDataReader().prepare(`SELECT marketing, weekly_digest,
    product_updates, itinerary_shared FROM email_preferences WHERE ownerId = ?`)
    .bind(ownerId).first<PreferenceRow>();
  if (!row) {
    if (owners.legacy) throw new Error("Historical email preferences unavailable");
    return { ...defaults };
  }
  return parseRow(row);
}

/** Writes only an exact Better Auth owner's isolated preview row. */
export async function updatePreviewEmailPreferences(userId: string, patch: Partial<PreviewEmailPreferences>) {
  const owners = await ownerIds(userId);
  if (owners.legacy && owners.fresh) throw new Error("Conflicting preview preference owner");
  if (owners.legacy) await previewEmailPreferences(userId);
  const ownerId = owners.legacy ?? owners.fresh ?? await ensureOwnerId(userId);
  const db = previewAppDataReader();
  if (!owners.legacy) {
    await db.prepare(`INSERT OR IGNORE INTO email_preferences
      (ownerId, marketing, weekly_digest, product_updates, itinerary_shared)
      SELECT ?, 1, 1, 1, 1 WHERE EXISTS
      (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
      .bind(ownerId, ownerId).run();
  }
  const changed = await db.prepare(`UPDATE email_preferences SET
    marketing = coalesce(?, marketing), weekly_digest = coalesce(?, weekly_digest),
    product_updates = coalesce(?, product_updates), itinerary_shared = coalesce(?, itinerary_shared)
    WHERE ownerId = ? AND EXISTS (SELECT 1 FROM owners WHERE id = ?)`)
    .bind(...keys.map(key => patch[key] === undefined ? null : Number(patch[key])), ownerId, ownerId).run();
  if (changed.meta.changes !== 1) throw new Error("Preview email preference write unavailable");
  return previewEmailPreferences(userId);
}

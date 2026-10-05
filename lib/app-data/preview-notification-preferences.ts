import "server-only";
import type { NotificationPreferences } from "@/types";
import { ensureOwnerId, newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

const flags = ["pushEnabled", "emailEnabled", "achievements", "levelUps", "newSpots",
  "social", "challenges", "weeklyDigest", "system"] as const;
const keys: readonly string[] = [...flags, "quietHoursStart", "quietHoursEnd", "timezone"];
type Patch = Partial<Omit<NotificationPreferences, "clerkUserId" | "quietHoursStart" | "quietHoursEnd">>
  & { quietHoursStart?: string | null; quietHoursEnd?: string | null };
type Row = Record<typeof flags[number], number>
  & { quietHoursStart: string | null; quietHoursEnd: string | null; timezone: string };
const time = (v: unknown) => v === null || (typeof v === "string"
  && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v));
function zone(v: unknown): boolean {
  if (typeof v !== "string" || !v || v.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; }
  catch { return false; }
}

export function parsePreviewNotificationPreferencePatch(value: unknown): Patch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const patch = value as Record<string, unknown>;
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !keys.includes(key))) return null;
  if (flags.some(key => key in patch && typeof patch[key] !== "boolean")) return null;
  if (["quietHoursStart", "quietHoursEnd"].some(key => key in patch && !time(patch[key]))) return null;
  if ("timezone" in patch && !zone(patch.timezone)) return null;
  return patch as Patch;
}

function preferences(row: Row, userId: string): NotificationPreferences {
  if (flags.some(key => row[key] !== 0 && row[key] !== 1)
    || !time(row.quietHoursStart) || !time(row.quietHoursEnd) || !zone(row.timezone)) {
    throw new Error("Invalid preview notification preferences");
  }
  return { clerkUserId: userId,
    ...Object.fromEntries(flags.map(key => [key, row[key] === 1])) as Record<typeof flags[number], boolean>,
    quietHoursStart: row.quietHoursStart ?? undefined, quietHoursEnd: row.quietHoursEnd ?? undefined,
    timezone: row.timezone };
}

/** Match the existing isolated inbox restriction; never invent historical preferences. */
async function freshOwner(userId: string): Promise<string> {
  const owners = await ownerIds(userId);
  if (owners.legacy) throw new Error("Historical notification preferences unavailable");
  const ownerId = owners.fresh ?? await ensureOwnerId(userId);
  if (ownerId !== newOwnerId(userId)) throw new Error("Conflicting notification preference owner");
  return ownerId;
}

export async function previewNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const ownerId = await freshOwner(userId);
  const db = previewAppDataReader();
  await db.prepare(`INSERT OR IGNORE INTO preview_notification_preferences(ownerId)
    SELECT ? WHERE EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')
    AND NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?)`)
    .bind(ownerId, ownerId, userId).run();
  const row = await db.prepare(`SELECT p.* FROM preview_notification_preferences p
    JOIN owners o ON o.id = p.ownerId AND o.source = 'new' WHERE p.ownerId = ?
    AND NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?)`)
    .bind(ownerId, userId).first<Row>();
  if (!row) throw new Error("Preview notification preferences unavailable");
  return preferences(row, userId);
}

export async function updatePreviewNotificationPreferences(userId: string, patch: Patch): Promise<NotificationPreferences> {
  const checked = parsePreviewNotificationPreferencePatch(patch);
  if (!checked) throw new Error("Invalid notification preference patch");
  await previewNotificationPreferences(userId);
  const ownerId = newOwnerId(userId);
  const db = previewAppDataReader();
  const changed = await db.prepare(`UPDATE preview_notification_preferences SET
    ${flags.map(key => `${key} = coalesce(?, ${key})`).join(", ")},
    quietHoursStart = CASE WHEN ? THEN ? ELSE quietHoursStart END,
    quietHoursEnd = CASE WHEN ? THEN ? ELSE quietHoursEnd END,
    timezone = coalesce(?, timezone)
    WHERE ownerId = ? AND EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')
    AND NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?)`)
    .bind(...flags.map(key => checked[key] === undefined ? null : Number(checked[key])),
      Number("quietHoursStart" in checked), checked.quietHoursStart ?? null,
      Number("quietHoursEnd" in checked), checked.quietHoursEnd ?? null,
      checked.timezone ?? null, ownerId, ownerId, userId).run();
  if (changed.meta.changes !== 1) throw new Error("Preview notification preference write unavailable");
  return previewNotificationPreferences(userId);
}

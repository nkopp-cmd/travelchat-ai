import "server-only";
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { TIER_CONFIGS } from "@/lib/subscription";
import { ensureOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

interface SavedRow {
  id: string; spot_id: string; createdAtMs: number; catalogId: string | null;
  name: string | null; description: string | null; category: string | null;
  localley_score: number | null; photos: string | null;
}

export function isPreviewSavedSpotCandidate(req: NextRequest): boolean {
  return req.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && req.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

export async function previewSavedSpot(userId: string, spotId: string): Promise<boolean> {
  const owners = await ownerIds(userId);
  if (!owners.legacy && !owners.fresh) return false;
  const row = await previewAppDataReader().prepare(`SELECT id FROM saved_spots
    WHERE ownerId IN (?, ?) AND spotId = ? LIMIT 1`)
    .bind(owners.legacy ?? "", owners.fresh ?? "", spotId).first<{ id: string }>();
  return !!row;
}

export async function previewSavedSpots(userId: string): Promise<{ success: true; spots: {
  id: string; spot_id: string; created_at: string; spots: {
    id: string; name: unknown; description: unknown; category: string;
    localley_score: number | null; photos: unknown;
  } | null;
}[] }> {
  const owners = await ownerIds(userId);
  if (!owners.legacy && !owners.fresh) return { success: true, spots: [] };
  const { results } = await previewAppDataReader().prepare(`SELECT s.id, s.spotId AS spot_id,
    s.createdAtMs, p.id AS catalogId, p.name, p.description, p.category,
    p.localley_score, p.photos FROM saved_spots s
    LEFT JOIN spots p ON p.id = s.spotId WHERE s.ownerId IN (?, ?)
    ORDER BY s.createdAtMs DESC, s.id DESC LIMIT 1001`)
    .bind(owners.legacy ?? "", owners.fresh ?? "").all<SavedRow>();
  if (!Array.isArray(results) || results.length > 1000) throw new Error("Preview saved spot count exceeds limit");
  return { success: true, spots: results.map(row => {
    if (!Number.isSafeInteger(row.createdAtMs) || row.createdAtMs < 0) {
      throw new Error("Invalid preview saved spot date");
    }
    return { id: row.id, spot_id: row.spot_id,
      created_at: new Date(row.createdAtMs).toISOString(),
      spots: row.catalogId === null ? null : {
        id: row.catalogId, name: JSON.parse(row.name ?? "null"),
        description: JSON.parse(row.description ?? "null"), category: row.category ?? "",
        localley_score: row.localley_score,
        photos: row.photos === null ? null : JSON.parse(row.photos),
      } };
  }) };
}

export async function createPreviewSavedSpot(userId: string, spotId: string): Promise<
  { kind: "saved" | "already" | "missing" } | { kind: "limit"; current: number; limit: number }
> {
  const db = previewAppDataReader();
  const spot = await db.prepare("SELECT id FROM spots WHERE id = ? AND visible = 1")
    .bind(spotId).first<{ id: string }>();
  if (!spot) return { kind: "missing" };
  if (await previewSavedSpot(userId, spotId)) return { kind: "already" };
  const ownerId = await ensureOwnerId(userId);
  const owners = await ownerIds(userId);
  if (ownerId === owners.fresh) {
    await db.prepare(`INSERT OR IGNORE INTO owner_limits(ownerId, savedSpotLimit)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')`)
      .bind(ownerId, TIER_CONFIGS.free.limits.savedSpotsLimit, ownerId).run();
  }
  const id = randomUUID();
  const result = await db.prepare(`INSERT OR IGNORE INTO saved_spots(id, ownerId, spotId, createdAtMs)
    SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM spots WHERE id = ? AND visible = 1)
      AND (SELECT count(*) FROM saved_spots WHERE ownerId IN (?, ?))
        < (SELECT savedSpotLimit FROM owner_limits WHERE ownerId = ?)
      AND NOT EXISTS (SELECT 1 FROM saved_spots WHERE spotId = ? AND ownerId IN (?, ?))`)
    .bind(id, ownerId, spotId, Date.now(), spotId, owners.legacy ?? "", owners.fresh ?? "",
      ownerId, spotId, owners.legacy ?? "", owners.fresh ?? "").run();
  if (result.meta.changes === 1) return { kind: "saved" };
  if (result.meta.changes !== 0) throw new Error("Unexpected preview save count");
  if (await previewSavedSpot(userId, spotId)) return { kind: "already" };
  const status = await db.prepare(`SELECT l.savedSpotLimit AS limitCount,
    (SELECT count(*) FROM saved_spots WHERE ownerId IN (?, ?)) AS currentCount
    FROM owner_limits l WHERE l.ownerId = ?`)
    .bind(owners.legacy ?? "", owners.fresh ?? "", ownerId)
    .first<{ limitCount: number; currentCount: number }>();
  if (!status || !Number.isSafeInteger(status.limitCount) || !Number.isSafeInteger(status.currentCount)) {
    throw new Error("Preview saved spot limit unavailable");
  }
  if (status.currentCount >= status.limitCount) {
    return { kind: "limit", current: status.currentCount, limit: status.limitCount };
  }
  return { kind: "missing" };
}

export async function deletePreviewSavedSpot(userId: string, spotId: string): Promise<void> {
  const owners = await ownerIds(userId);
  if (!owners.legacy && !owners.fresh) return;
  await previewAppDataReader().prepare(`DELETE FROM saved_spots
    WHERE ownerId IN (?, ?) AND spotId = ?`)
    .bind(owners.legacy ?? "", owners.fresh ?? "", spotId).run();
}

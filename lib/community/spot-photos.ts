import "server-only";
import { SPOT_PHOTO_KEY, spotPhotoPath } from "@/lib/spots/own-photo";
import type { CommunityDb } from "./qa";

export { SPOT_PHOTO_KEY, spotPhotoPath };
export const TIP_PHOTO_LICENCE = "Localley contributor consent";

type Bucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>;
};

export type SpotPhotoRow = { spot_id: string; r2_key: string; source: string; licence: string; author: string | null };

export async function spotPhotoByKey(db: CommunityDb, key: string): Promise<SpotPhotoRow | null> {
  return db.prepare("SELECT spot_id, r2_key, source, licence, author FROM spot_photos WHERE r2_key = ?").bind(key).first<SpotPhotoRow>();
}

/**
 * Admin choice: the photo of a visible tip whose author consented becomes the spot's lead photo (lowest position).
 * The bytes are copied (hiding the tip later does not break the spot page). Other photos of the spot stay: a spot
 * keeps several real-place photos from mixed sources (migration 0049). The same bytes again move to the front.
 */
export async function promoteTipPhoto(db: CommunityDb, bucket: Bucket, tipId: string, adminId: string):
  Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const tip = await db.prepare("SELECT spot_id, author_name, photo_key FROM spot_tips WHERE id = ? AND status = 'visible' AND photo_spot_consent = 1 AND photo_key IS NOT NULL")
    .bind(tipId).first<{ spot_id: string; author_name: string; photo_key: string }>();
  if (!tip) return { ok: false, error: "Only a visible tip photo with the author's consent can be the spot photo." };
  const object = await bucket.get(tip.photo_key);
  if (!object) return { ok: false, error: "The photo file is missing." };
  const bytes = await object.arrayBuffer();
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `spot-photos/${tip.spot_id}/${sha}.webp`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
  // One statement: the new position is computed inside the INSERT, so two promotions cannot take the same slot.
  await db.prepare(`INSERT INTO spot_photos (r2_key, spot_id, position, source, licence, author, tip_id, approved_by)
    VALUES (?, ?, (SELECT COALESCE(MIN(position), 1) - 1 FROM spot_photos WHERE spot_id = ?), 'tip', ?, ?, ?, ?)
    ON CONFLICT(r2_key) DO UPDATE SET position = (SELECT COALESCE(MIN(position), 1) - 1 FROM spot_photos WHERE spot_id = excluded.spot_id),
      licence = excluded.licence, author = excluded.author, tip_id = excluded.tip_id, approved_by = excluded.approved_by,
      approved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(key, tip.spot_id, tip.spot_id, TIP_PHOTO_LICENCE, tip.author_name, tipId, adminId).run();
  return { ok: true, key };
}

import "server-only";
import type { CommunityDb } from "./qa";

/** R2 object (COMMUNITY_MEDIA bucket) of a spot's own photo: content-addressed, so the public URL is immutable. */
export const SPOT_PHOTO_KEY = /^spot-photos\/([0-9a-f-]{36})\/([0-9a-f]{64})\.webp$/;
export const TIP_PHOTO_LICENCE = "Localley contributor consent";

type Bucket = {
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
};

export type SpotPhotoRow = { spot_id: string; r2_key: string; source: string; licence: string; author: string | null };

/** Public path of a stored spot photo. */
export function spotPhotoPath(key: string): string {
  const match = SPOT_PHOTO_KEY.exec(key);
  if (!match) throw new Error("not a spot photo key");
  return `/media/spot/${match[1]}/${match[2]}.webp`;
}

export async function spotPhotoByKey(db: CommunityDb, key: string): Promise<SpotPhotoRow | null> {
  return db.prepare("SELECT spot_id, r2_key, source, licence, author FROM spot_photos WHERE r2_key = ?").bind(key).first<SpotPhotoRow>();
}

/**
 * Admin choice: the photo of a visible tip whose author consented becomes the spot's photo. The bytes are copied
 * (hiding the tip later does not break the spot page); a replaced spot photo object is deleted after the row moves.
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
  const previous = await db.prepare("SELECT r2_key FROM spot_photos WHERE spot_id = ?").bind(tip.spot_id).first<{ r2_key: string }>();
  await bucket.put(key, bytes, { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
  await db.prepare(`INSERT INTO spot_photos (spot_id, r2_key, source, licence, author, tip_id, approved_by) VALUES (?, ?, 'tip', ?, ?, ?, ?)
    ON CONFLICT(spot_id) DO UPDATE SET r2_key = excluded.r2_key, source = excluded.source, licence = excluded.licence, author = excluded.author,
      source_url = NULL, tip_id = excluded.tip_id, approved_by = excluded.approved_by, approved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(tip.spot_id, key, TIP_PHOTO_LICENCE, tip.author_name, tipId, adminId).run();
  if (previous && previous.r2_key !== key) await bucket.delete(previous.r2_key);
  return { ok: true, key };
}

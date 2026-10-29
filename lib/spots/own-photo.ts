/** R2 object (COMMUNITY_MEDIA bucket) of a spot's own photo: content-addressed, so the public URL is immutable. */
export const SPOT_PHOTO_KEY = /^spot-photos\/([0-9a-f-]{36})\/([0-9a-f]{64})\.webp$/;

/** Public path of a stored spot photo. */
export function spotPhotoPath(key: string): string {
  const match = SPOT_PHOTO_KEY.exec(key);
  if (!match) throw new Error("not a spot photo key");
  return `/media/spot/${match[1]}/${match[2]}.webp`;
}

/** Public path for a spot_photos.r2_key read from D1, or null when there is none (or it is not a spot photo key). */
export function ownSpotPhotoPath(key: unknown): string | null {
  return typeof key === "string" && SPOT_PHOTO_KEY.test(key) ? spotPhotoPath(key) : null;
}

/**
 * Photos a card or hero shows without a Places call. Our own R2 photo comes first; a Google listing without one
 * gets [] so the client asks Places (the fallback, never stored); other spots keep their direct source photos.
 */
export function directSpotPhotos(spot: { ownPhoto?: string | null; googlePlaceId?: string | null; photos?: string[] | null }): string[] {
  const direct = spot.googlePlaceId ? [] : (spot.photos ?? []).filter((photo) => !photo.includes("/api/places/photo"));
  return spot.ownPhoto ? [spot.ownPhoto, ...direct.filter((photo) => photo !== spot.ownPhoto)] : direct;
}

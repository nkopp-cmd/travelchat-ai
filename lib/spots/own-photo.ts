import type { OwnPhotoCredit } from "@/types";

/** R2 object (COMMUNITY_MEDIA bucket) of a spot's own photo: content-addressed, so the public URL is immutable. */
export const SPOT_PHOTO_KEY = /^spot-photos\/([0-9a-f-]{36})\/([0-9a-f]{64})\.webp$/;

/** Public path of a stored spot photo. */
export function spotPhotoPath(key: string): string {
  const match = SPOT_PHOTO_KEY.exec(key);
  if (!match) throw new Error("not a spot photo key");
  return `/media/spot/${match[1]}/${match[2]}.webp`;
}

/** Width of the small copy (`<sha>-w480.webp` next to the full photo) that cards, pins and Nearby rows show. */
export const SPOT_THUMB_WIDTH = 480;

/** The small-copy path of a stored spot photo; other URLs stay as they are. The route serves the full photo until the copy exists. */
export function spotPhotoThumbPath(src: string): string {
  return /^\/media\/spot\/[0-9a-f-]{36}\/[0-9a-f]{64}\.webp$/.test(src) ? src.replace(/\.webp$/, `-w${SPOT_THUMB_WIDTH}.webp`) : src;
}

/** Width of the pin copy (`<sha>-w144.webp`): a pin face is 44 px, so 144 px stays sharp at 3x density. */
export const SPOT_PIN_WIDTH = 144;

/** The pin-copy path of a stored spot photo (full or 480 px path); other URLs stay as they are. */
export function spotPhotoPinPath(src: string): string {
  return /^\/media\/spot\/[0-9a-f-]{36}\/[0-9a-f]{64}(-w480)?\.webp$/.test(src) ? src.replace(/(-w480)?\.webp$/, `-w${SPOT_PIN_WIDTH}.webp`) : src;
}

/** Public path for a spot_photos.r2_key read from D1, or null when there is none (or it is not a spot photo key). */
export function ownSpotPhotoPath(key: unknown): string | null {
  return typeof key === "string" && SPOT_PHOTO_KEY.test(key) ? spotPhotoPath(key) : null;
}

/**
 * Photos a card or hero shows without a Places call. Our own R2 photo comes first; a Google listing without one
 * gets [] so the client asks Places (the fallback, never stored); other spots keep their direct source photos.
 */
export function directSpotPhotos(spot: { ownPhoto?: string | null; ownPhotos?: string[] | null; googlePlaceId?: string | null; photos?: string[] | null }): string[] {
  const direct = spot.googlePlaceId ? [] : (spot.photos ?? []).filter((photo) => !photo.includes("/api/places/photo"));
  const own = spot.ownPhotos?.length ? spot.ownPhotos : spot.ownPhoto ? [spot.ownPhoto] : [];
  return [...own, ...direct.filter((photo) => !own.includes(photo))];
}

/**
 * Width of the one Google photo a card, Nearby row or map pin shows. Google bills per photo request, not per pixel,
 * so every small surface asks for the SAME URL: the browser cache (private, 1 day) then serves card + pin + Nearby
 * with one billed call per spot and visitor a day. 400 keeps a 390 px phone card sharp enough.
 */
export const CARD_PHOTO_WIDTH = 400;
const PLACE_PHOTO_NAME = /^places\/[A-Za-z0-9_-]{1,256}\/photos\/[A-Za-z0-9_-]{1,4096}$/;

/** The stored Google photo name (D1 spots.photos = /api/places/photo?name=...) of a spot, or null. */
export function storedGooglePhotoName(photos: readonly string[] | null | undefined): string | null {
  for (const photo of photos ?? []) {
    if (!photo.includes("/api/places/photo")) continue;
    try {
      const name = new URL(photo, "https://www.localley.io").searchParams.get("name");
      if (name && PLACE_PHOTO_NAME.test(name)) return name;
    } catch { /* not a URL */ }
  }
  return null;
}

/**
 * A listing with a place id but no stored photo name (e.g. added from a news event) still gets its Google photo:
 * the proxy reads only the place id from the name and asks Details for the current first photo.
 */
function placeIdPhotoName(placeId: string | null | undefined): string | null {
  const name = placeId ? `places/${placeId}/photos/current` : null;
  return name && PLACE_PHOTO_NAME.test(name) ? name : null;
}

/** The canonical small proxy URL for a stored Google photo name (one URL per spot, shared by every small surface). */
export function cardGooglePhotoUrl(name: string): string {
  return `/api/places/photo?name=${encodeURIComponent(name)}&w=${CARD_PHOTO_WIDTH}`;
}

/**
 * Photos a card, Nearby row or pin shows, server-rendered and without a Details call: our own photo, the direct
 * source photos, then the spot's first stored Google photo (one Photo call, lazy, browser-cached for a day).
 */
export function cardSpotPhotos(spot: { ownPhoto?: string | null; googlePlaceId?: string | null; photos?: string[] | null }): string[] {
  const name = storedGooglePhotoName(spot.photos) ?? placeIdPhotoName(spot.googlePlaceId);
  // A 1600 px photo is 300-700 KB; the 480 px copy keeps a list of pins light.
  return [...directSpotPhotos(spot).map(spotPhotoThumbPath), ...(name ? [cardGooglePhotoUrl(name)] : [])];
}

/** The credit of a card's own photo, keyed by the small-copy path cardSpotPhotos shows. */
export function cardPhotoCredits(spot: { ownPhoto?: string | null; ownPhotoCredit?: OwnPhotoCredit | null }): Array<OwnPhotoCredit & { src: string }> {
  return spot.ownPhoto && spot.ownPhotoCredit ? [{ src: spotPhotoThumbPath(spot.ownPhoto), ...spot.ownPhotoCredit }] : [];
}

/** True for the canonical small Google proxy URL built by cardGooglePhotoUrl. */
export function isCardGooglePhotoUrl(src: string): boolean {
  const name = storedGooglePhotoName([src]);
  return name !== null && src === cardGooglePhotoUrl(name);
}

/** A stored spot photo with what its licence asks us to show (author, licence, source page). */
export type StoredSpotPhoto = {
  src: string;
  /** "Wikimedia Commons · CC BY-SA 4.0"; null for tip/own/cc0 photos, which need no credit. */
  label: string | null;
  author: string | null;
  sourceUrl: string | null;
  /** One-line credit for lists: "Kakidai · CC BY-SA 4.0 · Wikimedia Commons". */
  credit: string | null;
};

/** Display name of each spot_photos source; tip/own/cc0 photos need no credit line. */
const CREDIT_SOURCES: Record<string, string> = { commons: "Wikimedia Commons", kto: "Korea Tourism Organization", pexels: "Pexels" };

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

/** KTO authors read "Korea Tourism Organization / <photographer>": drop the source name the label already shows. */
function withoutSource(author: string | null, source: string): string | null {
  if (!author) return null;
  const rest = author.startsWith(source) ? author.slice(source.length).replace(/^[\s/·,:-]+/, "").trim() : author;
  return rest || null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
}

/** D1 json_group_array of {k, s, l, a, u} (spot_photos rows in position order) -> stored photos with credits. */
export function parseStoredSpotPhotos(json: unknown): StoredSpotPhoto[] {
  let rows: unknown;
  try { rows = typeof json === "string" ? JSON.parse(json) : null; } catch { return []; }
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const src = row && typeof row === "object" ? ownSpotPhotoPath((row as { k?: unknown }).k) : null;
    if (!src) return [];
    const { s, l, a, u } = row as Record<string, unknown>;
    const source = typeof s === "string" ? CREDIT_SOURCES[s] : undefined;
    const licence = text(l);
    const author = source ? withoutSource(text(a), source) : null;
    return [{
      src, author, sourceUrl: source ? httpsUrl(u) : null,
      label: source ? [source, licence].filter(Boolean).join(" · ") : null,
      credit: source ? [author, licence, source].filter(Boolean).join(" · ") : null,
    }];
  });
}

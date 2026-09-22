import type { RuntimeEnv } from "./runtime";

// Google listing photos for a catalog place. These are provider-listing associations,
// never editor-confirmed venue evidence, and they are never cached or copied to R2.
export const listingGalleryPath = /^\/api\/spots\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/photos$/;
export const listingPhotoPath = "/api/places/photo";
const placeIdPattern = /^[A-Za-z0-9_-]{1,256}$/;
const photoNamePattern = /^places\/([A-Za-z0-9_-]{1,256})\/photos\/[A-Za-z0-9_-]{1,4096}$/;
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const maxIdentityKm = 1;
export const galleryVersion = "venue-photos-cf1";

export type ListingGallery = {
  status: "available" | "unavailable";
  photos: { id: string; url: string; sourceLabel: string; attributions: { displayName: string; uri?: string }[] }[];
  message?: string;
};
type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
type ListingEnv = { GOOGLE_PLACES_API_KEY?: unknown; LISTING_LIMITER?: Limiter; LISTING_MEDIA_LIMITER?: Limiter };

function unavailable(status = 200, message = "Listing photos are unavailable.") {
  return Response.json({ status: "unavailable", photos: [], message } satisfies ListingGallery, { status, headers });
}
function mediaUnavailable(status = 502) {
  return new Response("Place photo unavailable", { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}
function apiKey(env: RuntimeEnv): string | null {
  const value = (env as ListingEnv).GOOGLE_PLACES_API_KEY;
  return typeof value === "string" && value.trim().length >= 20 ? value.trim() : null;
}
// Fail closed: a missing or failing limiter never falls back to an unlimited path.
async function allowed(limiter: Limiter | undefined, ip: string): Promise<boolean | null> {
  if (!limiter || typeof limiter.limit !== "function") return null;
  try { return (await limiter.limit({ key: ip })).success === true; } catch { return null; }
}
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (value: number) => value * Math.PI / 180;
  const h = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
async function readBounded(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > limit) { await response.body?.cancel(); throw new Error("Too large"); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
// Magic bytes decide the type. Provider Content-Type headers are not trusted.
export function imageType(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length < 12) return null;
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  return null;
}
function trustedImageUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !(host === "googleusercontent.com" || host.endsWith(".googleusercontent.com") || host === "ggpht.com" || host.endsWith(".ggpht.com"))) {
    throw new Error("Untrusted image host");
  }
  return url;
}
type ListingRow = { id: string; latitude: number | null; longitude: number | null; place_id: string | null };
async function listingPlace(env: RuntimeEnv, spotId: string) {
  return await env.DB.prepare(`SELECT s.id, s.latitude, s.longitude, l.place_id FROM spots s
    LEFT JOIN spot_listing_places l ON l.spot_id = s.id AND l.provider = 'google'
    WHERE s.id = ? AND s.visible = 1`).bind(spotId).first<ListingRow>();
}

function parsePlace(value: unknown, placeId: string) {
  if (!value || typeof value !== "object") return null;
  const place = value as Record<string, unknown>;
  const location = place.location as Record<string, unknown> | undefined;
  const lat = location?.latitude, lng = location?.longitude;
  if (place.id !== placeId || typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)
    || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const photos = Array.isArray(place.photos) ? place.photos : [];
  return { lat, lng, photos };
}
function attributions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const author = entry as Record<string, unknown>;
    const displayName = typeof author.displayName === "string" ? author.displayName.replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 120) : "";
    if (!displayName) return [];
    let uri: string | undefined;
    try {
      const raw = typeof author.uri === "string" ? author.uri : "";
      const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
      if (url.protocol === "https:" && !url.username && !url.password) uri = url.href;
    } catch { /* Keep the author's name when the link is unsafe or absent. */ }
    return [{ displayName, ...(uri ? { uri } : {}) }];
  });
}

export async function listingGallery(spotId: string, env: RuntimeEnv, ip: string): Promise<Response> {
  const permitted = await allowed((env as ListingEnv).LISTING_LIMITER, ip);
  if (permitted === null) return unavailable(503);
  if (!permitted) return unavailable(429, "Too many requests. Please try again later.");
  const spot = await listingPlace(env, spotId);
  if (!spot) return unavailable(404);
  if (!spot.place_id || !placeIdPattern.test(spot.place_id)) return unavailable();
  // Without catalog coordinates the listing identity cannot be corroborated.
  if (typeof spot.latitude !== "number" || typeof spot.longitude !== "number") return unavailable();
  const key = apiKey(env);
  if (!key) return unavailable(503);
  let response: Response;
  try {
    response = await fetch(`https://places.googleapis.com/v1/places/${spot.place_id}?languageCode=en`, {
      redirect: "manual", signal: AbortSignal.timeout(10_000),
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,location,photos" },
    });
  } catch { return unavailable(504); }
  if (!response.ok) { await response.body?.cancel(); return unavailable(502); }
  let place;
  try { place = parsePlace(JSON.parse(new TextDecoder().decode(await readBounded(response, 256 * 1024))), spot.place_id); }
  catch { return unavailable(502); }
  if (!place) return unavailable(502);
  // Coordinates corroborate the listing, not an entrance or the content of each photo.
  if (distanceKm(spot.latitude, spot.longitude, place.lat, place.lng) > maxIdentityKm) return unavailable(200, "The matched listing is not at this place. No listing photos are shown.");
  const gallery: ListingGallery["photos"] = [];
  const names = new Set<string>();
  for (const entry of place.photos) {
    if (!entry || typeof entry !== "object") continue;
    const photo = entry as Record<string, unknown>;
    const name = photo.name;
    if (typeof name !== "string" || photoNamePattern.exec(name)?.[1] !== spot.place_id || names.has(name)) continue;
    names.add(name);
    const params = new URLSearchParams({ spot: spot.id, name, w: "1200", v: galleryVersion });
    gallery.push({ id: name, url: `${listingPhotoPath}?${params}`, sourceLabel: "Google listing photo", attributions: attributions(photo.authorAttributions) });
    if (gallery.length === 4) break;
  }
  return gallery.length ? Response.json({ status: "available", photos: gallery } satisfies ListingGallery, { headers }) : unavailable();
}

export async function listingPhoto(url: URL, env: RuntimeEnv, ip: string): Promise<Response> {
  const params = url.searchParams;
  const keys = [...params.keys()];
  if (keys.some((key) => !["spot", "name", "w", "v"].includes(key)) || keys.length !== new Set(keys).size) return mediaUnavailable(400);
  const spotId = params.get("spot") ?? "", name = params.get("name") ?? "", width = Number(params.get("w") ?? "1200");
  const placeId = photoNamePattern.exec(name)?.[1];
  if (!uuidPattern.test(spotId) || !placeId || !Number.isInteger(width) || width < 200 || width > 1600) return mediaUnavailable(400);
  const permitted = await allowed((env as ListingEnv).LISTING_MEDIA_LIMITER, ip);
  if (permitted === null) return mediaUnavailable(503);
  if (!permitted) return mediaUnavailable(429);
  // The photo must belong to the listing stored for a visible catalog place: this is not an open proxy.
  const spot = await listingPlace(env, spotId);
  if (!spot?.place_id || spot.place_id !== placeId) return mediaUnavailable(404);
  const key = apiKey(env);
  if (!key) return mediaUnavailable(503);
  try {
    const media = new URL(`https://places.googleapis.com/v1/${name}/media`);
    media.searchParams.set("maxWidthPx", String(width));
    media.searchParams.set("skipHttpRedirect", "true");
    const response = await fetch(media.href, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "X-Goog-Api-Key": key } });
    if (!response.ok) { await response.body?.cancel(); return mediaUnavailable(response.status === 404 ? 404 : 502); }
    const data: unknown = JSON.parse(new TextDecoder().decode(await readBounded(response, 64 * 1024)));
    const photoUri = data && typeof data === "object" ? (data as Record<string, unknown>).photoUri : undefined;
    if (typeof photoUri !== "string") return mediaUnavailable();
    let imageUrl = trustedImageUrl(photoUri);
    for (let redirects = 0; redirects <= 2; redirects++) {
      // The key is never sent to the image host.
      const image = await fetch(imageUrl.href, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if ([301, 302, 303, 307, 308].includes(image.status)) {
        await image.body?.cancel();
        const location = image.headers.get("location");
        if (!location || redirects === 2) return mediaUnavailable();
        imageUrl = trustedImageUrl(new URL(location, imageUrl).href);
        continue;
      }
      if (!image.ok) { await image.body?.cancel(); return mediaUnavailable(); }
      const bytes = await readBounded(image, 8 * 1024 * 1024);
      const contentType = imageType(bytes);
      if (!contentType) return mediaUnavailable();
      return new Response(bytes, { headers: { ...headers, "Content-Type": contentType, "Cross-Origin-Resource-Policy": "same-origin" } });
    }
    return mediaUnavailable();
  } catch { return mediaUnavailable(502); }
}

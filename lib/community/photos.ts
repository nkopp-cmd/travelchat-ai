import "server-only";
import { PHOTO_MAX_WIDTH, checkPhoto, photoKey } from "./photo-rules";

/** Cloudflare bindings used for tip photos (production Worker only). */
type Images = {
  input(stream: ReadableStream): {
    transform(options: { width: number; fit: "scale-down" }): {
      output(options: { format: "image/webp"; quality: number }): Promise<{ image(): ReadableStream; contentType(): string }>;
    };
  };
};
type Bucket = {
  put(key: string, value: ReadableStream | ArrayBuffer, options: { httpMetadata: { contentType: string; cacheControl: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(key: string): Promise<void>;
};

function env(): { IMAGES?: Images; COMMUNITY_MEDIA?: Bucket } {
  return (globalThis as Record<symbol, { env?: { IMAGES?: Images; COMMUNITY_MEDIA?: Bucket } } | undefined>)[Symbol.for("__cloudflare-context__")]?.env ?? {};
}

export function photoBucket(): Bucket | null {
  return env().COMMUNITY_MEDIA ?? null;
}

/**
 * Re-encode an uploaded photo to WebP (at most PHOTO_MAX_WIDTH wide; the IMAGES binding writes no EXIF, so GPS and
 * camera data are dropped) and store it under tips/<tipId>/<uuid>.webp. Returns the key, or an error for the form.
 */
export async function storeTipPhoto(file: File, tipId: string): Promise<{ ok: true; key: string } | { ok: false; error: string }> {
  const verdict = checkPhoto(file.size, new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!verdict.ok) return verdict;
  const { IMAGES, COMMUNITY_MEDIA } = env();
  if (!IMAGES || !COMMUNITY_MEDIA) return { ok: false, error: "Photo upload is not available right now." };
  try {
    const result = await IMAGES.input(file.stream()).transform({ width: PHOTO_MAX_WIDTH, fit: "scale-down" }).output({ format: "image/webp", quality: 82 });
    const bytes = await new Response(result.image()).arrayBuffer();
    const key = photoKey(tipId, crypto.randomUUID());
    await COMMUNITY_MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/webp", cacheControl: "private, max-age=86400" } });
    return { ok: true, key };
  } catch (error) {
    console.error("[community] tip photo failed", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: "We could not process this photo. Try another one." };
  }
}

/** Spot-tip photo upload rules (pure, no bindings). The stored file is always a re-encoded WebP. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_WIDTH = 1600;

export type PhotoKind = "jpeg" | "png" | "webp" | "heic";

/** Detect the format from the first bytes; never trust the declared type. */
export function photoKind(head: Uint8Array): PhotoKind | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => head[i] === b)) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (head.length >= 12 && ascii(4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1"].includes(ascii(8, 12))) return "heic";
  return null;
}

export function checkPhoto(size: number, head: Uint8Array): { ok: true; kind: PhotoKind } | { ok: false; error: string } {
  if (size === 0) return { ok: false, error: "The photo is empty." };
  if (size > PHOTO_MAX_BYTES) return { ok: false, error: "Keep the photo under 5 MB." };
  const kind = photoKind(head);
  return kind ? { ok: true, kind } : { ok: false, error: "Use a JPEG, PNG, WebP or HEIC photo." };
}

/** R2 key of a tip photo; the media route accepts only keys of this shape. */
export function photoKey(tipId: string, fileId: string): string {
  return `tips/${tipId}/${fileId}.webp`;
}
export const PHOTO_KEY = /^tips\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/;

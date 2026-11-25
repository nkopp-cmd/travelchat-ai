/** AI mood images (trip-story plan T2) must never pose as photos of a place. */
const PHOTO_WORD = /\b(photo|photograph|picture|snapshot)s?\b/i;

/** Alt text of an own AI trip-story image: required, and it must not call the image a photo. */
export function tripStoryAlt(alt: string): string {
  const text = alt.trim();
  if (!text) throw new Error("trip-story image needs alt text");
  if (PHOTO_WORD.test(text)) throw new Error(`trip-story image alt must not call the image a photo: ${text}`);
  return text;
}

/** Public 1080 px WebP of a trip-story image (share image, JSON-LD). */
export const illustrationSrc = (sha: string) => `/media/trip-story/${sha}-1080.webp`;

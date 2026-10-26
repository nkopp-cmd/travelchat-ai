import "server-only";

/**
 * Story slides in R2 (Supabase exit 8a; localley-decisions.md 2026-10-26 "Story SLIDES to R2"). Rendered slides live in
 * STORY_MEDIA_R2 at story-slides/<itineraryId>/<generationId>/<slide>.png with a random generation per persist, so no
 * two stories share an object and deleting one never breaks another. They are served only through the access-checked
 * route /api/itineraries/<id>/story/media/<generation>/<slide> (owner, or a shared itinerary, unexpired, current story).
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SLIDE = "cover|summary|day(?:[1-9]|[12]\\d|30)";
const KEY = new RegExp(`^story-slides/(${UUID})/(${UUID})/(${SLIDE})\\.png$`);
const PATH = new RegExp(`/api/itineraries/(${UUID})/story/media/(${UUID})/(${SLIDE})$`);

interface StorySlideObject { arrayBuffer(): Promise<ArrayBuffer> }
export interface StorySlidesBucket {
    put(key: string, body: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
    get(key: string): Promise<StorySlideObject | null>;
    delete(key: string): Promise<void>;
}

export function storySlidesBucket(): StorySlidesBucket | null {
    const bucket = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)
        [Symbol.for("__cloudflare-context__")]?.env?.STORY_MEDIA_R2;
    if (!bucket || typeof bucket !== "object") return null;
    const candidate = bucket as Partial<StorySlidesBucket>;
    return typeof candidate.put === "function" && typeof candidate.get === "function" && typeof candidate.delete === "function"
        ? candidate as StorySlidesBucket : null;
}

export function storySlideKey(id: string, generation: string, slide: string): string | null {
    const key = `story-slides/${id}/${generation}/${slide}.png`;
    return KEY.test(key) ? key : null;
}

export function storySlidePath(id: string, generation: string, slide: string): string {
    return `/api/itineraries/${id}/story/media/${generation}/${slide}`;
}

/** The R2 key behind a stored slide URL of this itinerary, or null for any other URL (e.g. a Supabase signed URL). */
export function storySlideKeyFromUrl(id: string, url: string): string | null {
    let path: string;
    try { path = new URL(url, "https://localley.invalid").pathname; } catch { return null; }
    const match = PATH.exec(path);
    return match && match[1] === id ? storySlideKey(match[1], match[2], match[3]) : null;
}

/** R2 keys of every slide URL in a story_slides record (other URLs are ignored). */
export function storySlideKeys(id: string, storySlides: unknown): string[] {
    const slides = (storySlides as { slides?: unknown } | null)?.slides;
    if (!slides || typeof slides !== "object" || Array.isArray(slides)) return [];
    return Object.values(slides).flatMap((url) => {
        const key = typeof url === "string" ? storySlideKeyFromUrl(id, url) : null;
        return key ? [key] : [];
    });
}

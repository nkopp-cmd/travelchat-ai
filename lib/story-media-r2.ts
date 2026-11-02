import "server-only";

interface StoryMediaWriter {
    put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
    get(key: string): Promise<{ text(): Promise<string> } | null>;
}

function storyMediaBucket(): StoryMediaWriter | undefined {
    return (globalThis as Record<symbol, { env?: { STORY_MEDIA_R2?: StoryMediaWriter } } | undefined>)
        [Symbol.for("__cloudflare-context__")]?.env?.STORY_MEDIA_R2;
}

const CACHE_KEY = /^[A-Za-z0-9_-]{1,120}$/;
const MEDIA_PATH = /^\/media\/story\/[0-9a-f]{64}\.(png|jpg)$/;
const cacheObjectKey = (userId: string, cacheKey: string) =>
    CACHE_KEY.test(userId) && CACHE_KEY.test(cacheKey) ? `cache/${userId}/${cacheKey}` : null;

/**
 * Per-user slide cache (replaces the Supabase Storage list lookup, Supabase exit 8b): R2 object
 * cache/<userId>/<cacheKey> holds the /media/story/ path of the last background for that slide.
 */
export async function getStoryCachePath(userId: string, cacheKey: string): Promise<string | null> {
    const key = cacheObjectKey(userId, cacheKey), bucket = storyMediaBucket();
    if (!key || !bucket) return null;
    try {
        const path = (await (await bucket.get(key))?.text())?.trim() ?? "";
        return MEDIA_PATH.test(path) ? path : null;
    } catch {
        return null;
    }
}

export async function putStoryCachePath(userId: string, cacheKey: string, path: string): Promise<void> {
    const key = cacheObjectKey(userId, cacheKey), bucket = storyMediaBucket();
    if (!key || !bucket || !MEDIA_PATH.test(path)) return;
    await bucket.put(key, path, { httpMetadata: { contentType: "text/plain" } }).catch((error: unknown) =>
        console.error("[STORY_BG] R2 cache write failed:", error instanceof Error ? error.message : String(error)));
}

/**
 * Story media step 2 (shared/plans/localley-decisions.md): store a new story background content-addressed in R2
 * (binding STORY_MEDIA_R2, key legacy/<sha256>.<ext>) and return the host-less path the story route reads from R2:
 * /media/story/<sha256>.<ext>. Returns null when the binding is missing or the write fails.
 */
export async function putStoryMedia(bytes: Uint8Array, ext: "png" | "jpg", contentType: string): Promise<string | null> {
    try {
        const bucket = storyMediaBucket();
        if (!bucket) return null;
        const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
        const sha = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
        await bucket.put(`legacy/${sha}.${ext}`, bytes, { httpMetadata: { contentType } });
        return `/media/story/${sha}.${ext}`;
    } catch (error) {
        console.error("[STORY_BG] R2 write failed:", error instanceof Error ? error.message : String(error));
        return null;
    }
}

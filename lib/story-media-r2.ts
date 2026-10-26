import "server-only";

interface StoryMediaWriter {
    put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}

/**
 * Story media step 2 (shared/plans/localley-decisions.md): store a new story background content-addressed in R2
 * (binding STORY_MEDIA_R2, key legacy/<sha256>.<ext>) and return the host-less path the story route reads from R2:
 * /media/story/<sha256>.<ext>. Returns null when the binding is missing or the write fails, so the caller keeps the
 * Supabase Storage URL.
 */
export async function putStoryMedia(bytes: Uint8Array, ext: "png" | "jpg", contentType: string): Promise<string | null> {
    try {
        const bucket = (globalThis as Record<symbol, { env?: { STORY_MEDIA_R2?: StoryMediaWriter } } | undefined>)
            [Symbol.for("__cloudflare-context__")]?.env?.STORY_MEDIA_R2;
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

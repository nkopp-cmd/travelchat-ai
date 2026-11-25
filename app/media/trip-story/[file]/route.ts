import { NextRequest } from "next/server";

interface TripStoryObject { arrayBuffer(): Promise<ArrayBuffer> }
interface TripStoryReader { get(key: string): Promise<TripStoryObject | null> }

// Content-addressed 4:5 derivatives written by scripts/trip-story/export.mjs --derive. Nothing else in the bucket.
const FILE = /^[0-9a-f]{64}-(1080|540)\.(avif|webp)$/;
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/** Public trip-story section images (trip-story plan T1): R2 trip-story/<sha>-<width>.<avif|webp>, immutable. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
    const { file } = await params;
    if (!FILE.test(file)) return missing();
    const bucket = (globalThis as Record<symbol, { env?: { STORY_MEDIA_R2?: TripStoryReader } } | undefined>)
        [Symbol.for("__cloudflare-context__")]?.env?.STORY_MEDIA_R2;
    const object = await bucket?.get(`trip-story/${file}`).catch(() => null);
    if (!object) return missing();
    return new Response(new Uint8Array(await object.arrayBuffer()), {
        headers: {
            "Content-Type": file.endsWith(".avif") ? "image/avif" : "image/webp",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
        },
    });
}

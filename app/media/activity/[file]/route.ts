import { NextRequest } from "next/server";

interface ActivityThumbnailObject { arrayBuffer(): Promise<ArrayBuffer> }
interface ActivityThumbnailReader { get(key: string): Promise<ActivityThumbnailObject | null> }

const FILE = /^[0-9a-f]{1,8}\.png$/;
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/** Public AI activity thumbnails in R2 (activity-thumbnails/<hash>.png, written by lib/activity-images.ts). Nothing else. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
    const { file } = await params;
    if (!FILE.test(file)) return missing();
    const bucket = (globalThis as Record<symbol, { env?: { STORY_MEDIA_R2?: ActivityThumbnailReader } } | undefined>)
        [Symbol.for("__cloudflare-context__")]?.env?.STORY_MEDIA_R2;
    const object = await bucket?.get(`activity-thumbnails/${file}`).catch(() => null);
    if (!object) return missing();
    return new Response(new Uint8Array(await object.arrayBuffer()), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'" },
    });
}

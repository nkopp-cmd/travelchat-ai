import { NextRequest } from "next/server";
import { isRetiredLibraryPath } from "@/lib/image-library";

interface ActivityThumbnailObject { arrayBuffer(): Promise<ArrayBuffer> }
interface ActivityThumbnailReader { get(key: string): Promise<ActivityThumbnailObject | null> }

const FILE = /^[0-9a-f]{1,8}\.(png|webp)$/;
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Public AI activity thumbnails in R2: activity-thumbnails/<hash>.png (written by lib/activity-images.ts) and the
 * pre-generated library <hash>.webp (lib/image-library.ts). Nothing else.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
    const { file } = await params;
    if (!FILE.test(file) || isRetiredLibraryPath(`/media/activity/${file}`)) return missing();
    const bucket = (globalThis as Record<symbol, { env?: { STORY_MEDIA_R2?: ActivityThumbnailReader } } | undefined>)
        [Symbol.for("__cloudflare-context__")]?.env?.STORY_MEDIA_R2;
    const object = await bucket?.get(`activity-thumbnails/${file}`).catch(() => null);
    if (!object) return missing();
    return new Response(new Uint8Array(await object.arrayBuffer()), {
        headers: { "Content-Type": file.endsWith(".webp") ? "image/webp" : "image/png",
            "Cache-Control": file.endsWith(".webp") ? "public, max-age=31536000, immutable" : "public, max-age=86400", "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'" },
    });
}

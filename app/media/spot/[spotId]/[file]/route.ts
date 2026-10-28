import { NextRequest } from "next/server";
import { appDataDb } from "@/lib/app-data/backend";
import { photoBucket } from "@/lib/community/photos";
import type { CommunityDb } from "@/lib/community/qa";
import { spotPhotoByKey } from "@/lib/community/spot-photos";

const SPOT = /^[0-9a-f-]{36}$/;
const FILE = /^[0-9a-f]{64}\.webp$/;
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/** Public spot photos (lib/community/spot-photos.ts): only keys a spot_photos row names. Content-addressed, so immutable. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ spotId: string; file: string }> }) {
    const { spotId, file } = await params;
    if (!SPOT.test(spotId) || !FILE.test(file)) return missing();
    const key = `spot-photos/${spotId}/${file}`;
    const row = await spotPhotoByKey(appDataDb() as unknown as CommunityDb, key).catch(() => null);
    if (!row || row.spot_id !== spotId) return missing();
    const object = await photoBucket()?.get(key).catch(() => null);
    if (!object) return missing();
    return new Response(object.body, {
        headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
    });
}

import { NextRequest } from "next/server";
import { appDataDb } from "@/lib/app-data/backend";
import { photoBucket } from "@/lib/community/photos";
import type { CommunityDb } from "@/lib/community/qa";
import { spotPhotoByKey } from "@/lib/community/spot-photos";

const SPOT = /^[0-9a-f-]{36}$/;
// `<sha>.webp` is the full photo; `<sha>-w480.webp` its card copy, `<sha>-w144.webp` its pin copy (scripts/photos/make-thumbs.mjs).
// The old `-480`/`-144` copies show wrong photos (stale sharp cache) and stay unserved.
const FILE = /^([0-9a-f]{64})(-w480|-w144)?\.webp$/;
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/** Public spot photos (lib/community/spot-photos.ts): only keys a spot_photos row names. Content-addressed, so immutable. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ spotId: string; file: string }> }) {
    const { spotId, file } = await params;
    const name = FILE.exec(file);
    if (!SPOT.test(spotId) || !name) return missing();
    const key = `spot-photos/${spotId}/${name[1]}.webp`;
    const row = await spotPhotoByKey(appDataDb() as unknown as CommunityDb, key).catch(() => null);
    if (!row || row.spot_id !== spotId) return missing();
    const bucket = photoBucket();
    const exact = name[2] ? await bucket?.get(`spot-photos/${spotId}/${file}`).catch(() => null) : null;
    // No pin copy yet: the card copy is the next smallest. Any stand-in is cached for an hour only, until the copy exists.
    const object = exact
        ?? (name[2] === "-w144" ? await bucket?.get(`spot-photos/${spotId}/${name[1]}-w480.webp`).catch(() => null) : null)
        ?? await bucket?.get(key).catch(() => null);
    if (!object) return missing();
    const cache = name[2] && !exact ? "public, max-age=3600" : "public, max-age=31536000, immutable";
    return new Response(object.body, {
        headers: { "Content-Type": "image/webp", "Cache-Control": cache,
            "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
    });
}

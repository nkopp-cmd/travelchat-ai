import { NextRequest } from "next/server";
import { appDataDb } from "@/lib/app-data/backend";
import { photoBucket } from "@/lib/community/photos";
import type { CommunityDb } from "@/lib/community/qa";
import { spotPhotoByKey } from "@/lib/community/spot-photos";

const SPOT = /^[0-9a-f-]{36}$/;
// `<sha>.webp` is the full photo; `<sha>-w960.webp` its hero copy, `<sha>-w480.webp` its card copy, `<sha>-w144.webp` its pin copy
// (scripts/photos/make-thumbs.mjs).
// The old `-480`/`-144` copies show wrong photos (stale sharp cache) and stay unserved.
const FILE = /^([0-9a-f]{64})(-w960|-w480|-w144)?\.webp$/;
const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

/** Public spot photos (lib/community/spot-photos.ts): only keys a spot_photos row names. Content-addressed, so immutable. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ spotId: string; file: string }> }) {
    const { spotId, file } = await params;
    const name = FILE.exec(file);
    if (!SPOT.test(spotId) || !name) return missing();
    const key = `spot-photos/${spotId}/${name[1]}.webp`;
    const bucket = photoBucket();
    // Push CA4: the D1 check and the first R2 read run in parallel. On an edge miss (a cold colo far from the WEUR
    // database) they ran one after the other, two long round trips before the first byte of the LCP photo.
    // The bytes go out only when the row exists, so a takedown (row deleted + URL purged) still answers 404.
    const [row, exact] = await Promise.all([
        spotPhotoByKey(appDataDb() as unknown as CommunityDb, key).catch(() => null),
        (bucket?.get(name[2] ? `spot-photos/${spotId}/${file}` : key) ?? Promise.resolve(null)).catch(() => null),
    ]);
    if (!row || row.spot_id !== spotId) {
        await exact?.body.cancel().catch(() => undefined);
        return missing();
    }
    // No size copy yet: the pin copy falls back to the card copy (the next smallest), every copy to the full photo.
    // Any stand-in is cached for an hour only, until the copy exists.
    const object = exact
        ?? (name[2] === "-w144" ? await bucket?.get(`spot-photos/${spotId}/${name[1]}-w480.webp`).catch(() => null) : null)
        ?? (name[2] ? await bucket?.get(key).catch(() => null) : null);
    if (!object) return missing();
    const cache = name[2] && !exact ? "public, max-age=3600" : "public, max-age=31536000, immutable";
    return new Response(object.body, {
        headers: { "Content-Type": "image/webp", "Cache-Control": cache,
            "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" },
    });
}

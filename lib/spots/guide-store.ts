import "server-only";
import { dataBackend } from "@/lib/app-data/backend";
import { parseSpotGuide, SPOT_GUIDE_PREFIX, type SpotGuide } from "./guide";

type Bucket = {
  get(key: string): Promise<{ json<T>(): Promise<T> } | null>;
  list?(options: { prefix: string; cursor?: string; limit?: number }): Promise<{ objects: { key: string }[]; truncated: boolean; cursor?: string }>;
};

function bucket(): Bucket | null {
  return (globalThis as Record<symbol, { env?: { COMMUNITY_MEDIA?: Bucket } } | undefined>)[Symbol.for("__cloudflare-context__")]?.env?.COMMUNITY_MEDIA ?? null;
}

/** One R2 read per spot page render (the page itself is edge-cached); null when absent or invalid. */
export async function readSpotGuide(spotId: string): Promise<SpotGuide | null> {
  if (!/^[0-9a-f-]{36}$/.test(spotId)) return null;
  const media = dataBackend() === "d1" ? bucket() : null;
  if (!media) return null;
  try {
    const object = await media.get(`${SPOT_GUIDE_PREFIX}${spotId}.json`);
    return object ? parseSpotGuide(await object.json(), spotId) : null;
  } catch (error) {
    console.error("[spot-guide] unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Ids of every stored spot guide (R2 list, 1,000 keys per call, at most 20 calls); empty when R2 is absent. */
export async function listSpotGuideIds(): Promise<string[]> {
  const media = dataBackend() === "d1" ? bucket() : null;
  if (!media?.list) return [];
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await media.list({ prefix: SPOT_GUIDE_PREFIX, cursor, limit: 1000 });
    for (const object of result.objects) {
      const match = /([0-9a-f-]{36})\.json$/.exec(object.key);
      if (match) ids.push(match[1]);
    }
    if (!result.truncated || !result.cursor) break;
    cursor = result.cursor;
  }
  return ids;
}

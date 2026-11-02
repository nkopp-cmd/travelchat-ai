import "server-only";
import { dataBackend } from "@/lib/app-data/backend";
import { parseSpotGuide, SPOT_GUIDE_PREFIX, type SpotGuide } from "./guide";

type Bucket = { get(key: string): Promise<{ json<T>(): Promise<T> } | null> };

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

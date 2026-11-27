import { readFreshEdgeHtml } from "./edge-html-cache";
import { CANONICAL_HOST } from "./robots-host";

interface Env {
  ORIGIN: { fetch(request: Request): Promise<Response> };
  ORIGIN_VERSION?: string;
}

const FRONT_PATHS = new Set(["/sign-up", "/itineraries/new"]);
const CACHE_FRONT_HEADER = "x-localley-cache-front";

async function serveCacheFront(request: Request, env: Env, cache: Pick<Cache, "match">): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname === CANONICAL_HOST && FRONT_PATHS.has(url.pathname) && env.ORIGIN_VERSION && !request.headers.has("authorization")) {
    // Availability stays with the app on a miss, stale entry, or Cache API error.
    const hit = await readFreshEdgeHtml(request, env.ORIGIN_VERSION, cache).catch(() => null);
    if (hit) {
      hit.headers.set(CACHE_FRONT_HEADER, "HIT");
      return hit;
    }
  }
  return env.ORIGIN.fetch(request);
}

const worker = {
  fetch(request: Request, env: Env): Promise<Response> {
    return serveCacheFront(request, env, (caches as unknown as { default: Cache }).default);
  },
};

export default worker;

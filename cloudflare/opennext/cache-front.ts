import { isSpotDetailPath, readFreshEdgeHtml, SPOT_MEDIA_PATH, SPOTS_AZ_PATH } from "./edge-html-cache";
import { CANONICAL_HOST } from "./robots-host";

interface Env {
  ORIGIN: { fetch(request: Request): Promise<Response> };
  ORIGIN_VERSION?: string;
}

// Push DT1: every public HTML page whose edge HIT still booted the main Worker on a cold isolate (0.5-2.2 s from
// ci-1 on 2026-11-28): the auth forms, the spots list, the A-Z hubs and the spot pages. Every
// rule of the main Worker's cache (session cookie, RSC, query, stale) stays in readFreshEdgeHtml; anything else
// goes to the origin unchanged (/templates is a static asset, Push DT3). Keep the routes in cache-front.wrangler.jsonc in step.
const FRONT_PATHS = new Set(["/sign-up", "/sign-in", "/forgot-password", "/itineraries/new", "/spots"]);
// Push DT2: the stored spot photos (the spot hero is the LCP image). Their key has no Worker version, so a HIT
// here is the same immutable bytes the main Worker would send.
const isFrontPath = (pathname: string) =>
  FRONT_PATHS.has(pathname) || SPOTS_AZ_PATH.test(pathname) || isSpotDetailPath(pathname) || SPOT_MEDIA_PATH.test(pathname);
const CACHE_FRONT_HEADER = "x-localley-cache-front";

async function serveCacheFront(request: Request, env: Env, cache: Pick<Cache, "match">): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname === CANONICAL_HOST && isFrontPath(url.pathname) && env.ORIGIN_VERSION && !request.headers.has("authorization")) {
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

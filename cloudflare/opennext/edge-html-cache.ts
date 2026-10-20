/**
 * Edge cache for prerendered public HTML.
 *
 * These routes are static prerenders: the HTML is the same for every visitor
 * (account controls render on the client). Without this, every visit runs the
 * full OpenNext handler. The key carries the Worker version id, so a deploy
 * never serves HTML that points at removed hashed assets.
 */
export const EDGE_HTML_PATHS = new Set(["/", "/pricing"]);
export const EDGE_HTML_TTL_SECONDS = 86400;
export const EDGE_CACHE_HEADER = "x-localley-edge-cache";
const ORIGIN_CACHE_CONTROL = "x-localley-origin-cache-control";

type Handler = (request: Request) => Promise<Response>;

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export function isEdgeCacheable(request: Request): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.search || !EDGE_HTML_PATHS.has(url.pathname)) return false;
  // RSC and router-prefetch requests return flight data, not HTML (see Next's Vary header).
  for (const name of request.headers.keys()) {
    if (name === "rsc" || name.startsWith("next-router-")) return false;
  }
  return true;
}

export function edgeCacheKey(request: Request, version: string): Request {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}?__edge=${encodeURIComponent(version)}`);
}

function storable(response: Response): boolean {
  return response.status === 200
    && !response.headers.has("set-cookie")
    && (response.headers.get("content-type") ?? "").startsWith("text/html");
}

export async function serveWithEdgeCache(
  request: Request,
  version: string | undefined,
  cache: EdgeCache,
  waitUntil: (promise: Promise<unknown>) => void,
  handler: Handler,
): Promise<Response> {
  if (!version || !isEdgeCacheable(request)) return handler(request);
  const key = edgeCacheKey(request, version);
  const hit = await cache.match(key);
  if (hit) {
    const response = new Response(hit.body, hit);
    response.headers.set(EDGE_CACHE_HEADER, "HIT");
    const origin = response.headers.get(ORIGIN_CACHE_CONTROL);
    if (origin) response.headers.set("cache-control", origin);
    response.headers.delete(ORIGIN_CACHE_CONTROL);
    return response;
  }
  const fresh = await handler(request);
  if (!storable(fresh)) return fresh;
  const stored = new Response(fresh.clone().body, fresh);
  // The Cache API honours Cache-Control on put; visitors still get Next's own header.
  stored.headers.set(ORIGIN_CACHE_CONTROL, fresh.headers.get("cache-control") ?? "");
  stored.headers.set("cache-control", `public, s-maxage=${EDGE_HTML_TTL_SECONDS}`);
  waitUntil(cache.put(key, stored).catch(() => undefined));
  const response = new Response(fresh.body, fresh);
  response.headers.set(EDGE_CACHE_HEADER, "MISS");
  return response;
}

/**
 * Edge cache for public HTML.
 *
 * "/" and "/pricing" are static prerenders; "/spots" and its enabled-city
 * variants ("/spots?city=seoul") render per request but only from anonymous
 * catalog reads. The HTML is the same for every visitor
 * (account controls render on the client). Without this, every visit runs the
 * full OpenNext handler. The key carries the Worker version id, so a deploy
 * never serves HTML that points at removed hashed assets.
 */
import { ENABLED_CITIES } from "../../lib/cities";

// Seconds each path stays at the edge. Prerenders change only on deploy; the
// spots catalog is live data, so it refreshes every few minutes.
export const EDGE_HTML_TTL_SECONDS: Record<string, number> = { "/": 86400, "/pricing": 86400, "/spots": 300 };
// The only query the edge keys on: one enabled-city slug, so the key set stays bounded.
const EDGE_SPOTS_CITIES = new Set(ENABLED_CITIES.map((city) => city.slug));
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
  if (!Object.hasOwn(EDGE_HTML_TTL_SECONDS, url.pathname) || !cacheableQuery(url)) return false;
  // RSC and router-prefetch requests return flight data, not HTML (see Next's Vary header).
  for (const name of request.headers.keys()) {
    if (name === "rsc" || name.startsWith("next-router-")) return false;
  }
  return true;
}

function cacheableQuery(url: URL): boolean {
  if (!url.search) return true;
  if (url.pathname !== "/spots") return false;
  const keys = [...url.searchParams.keys()];
  return keys.length === 1 && keys[0] === "city" && EDGE_SPOTS_CITIES.has(url.searchParams.get("city") ?? "");
}

export function edgeCacheKey(request: Request, version: string): Request {
  const url = new URL(request.url);
  const city = url.searchParams.get("city");
  const variant = city ? `&city=${encodeURIComponent(city)}` : "";
  return new Request(`${url.origin}${url.pathname}?__edge=${encodeURIComponent(version)}${variant}`);
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
  stored.headers.set("cache-control", `public, s-maxage=${EDGE_HTML_TTL_SECONDS[new URL(request.url).pathname]}`);
  waitUntil(cache.put(key, stored).catch(() => undefined));
  const response = new Response(fresh.body, fresh);
  response.headers.set(EDGE_CACHE_HEADER, "MISS");
  return response;
}

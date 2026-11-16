/**
 * Edge cache for public HTML.
 *
 * "/" and "/pricing" are static prerenders; "/spots" and its enabled-city
 * variants ("/spots?city=seoul") render per request but only from anonymous
 * catalog reads. A spot detail page ("/spots/<uuid>") is the same: its server HTML
 * reads only public spot data, and the save, review and photo controls load on the client. The auth pages render the same form for every visitor (the
 * form reads its query on the client, and middleware never redirects them
 * by session), so they cache like prerenders. The HTML is the same for every visitor
 * (account controls render on the client). Without this, every visit runs the
 * full OpenNext handler. The key carries the Worker version id, so a deploy
 * never serves HTML that points at removed hashed assets.
 *
 * JSON exceptions: the planner's city list ("/api/cities?minSpots=1"), public catalog data
 * that is the same for every visitor and that the planner preloads with its HTML, and the spots map
 * pin index ("/api/spots/pins", unfiltered or one enabled city) with its per-pin cards.
 */
import { ENABLED_CITIES } from "../../lib/cities";

// Seconds each path stays at the edge. Prerenders change only on deploy; the
// spots catalog is live data, so it refreshes every few minutes.
export const EDGE_HTML_TTL_SECONDS: Record<string, number> = {
  "/": 86400,
  "/pricing": 86400,
  "/privacy": 86400,
  "/terms": 86400,
  // Newsletter sign-up and its static answer pages (the confirm/unsubscribe button pages carry tokens: never cached).
  "/newsletter": 86400,
  "/newsletter/thanks": 86400,
  "/newsletter/confirmed": 86400,
  "/newsletter/unsubscribed": 86400,
  "/newsletter/invalid": 86400,
  "/newsletter/check-email": 86400,
  "/newsletter/retry": 86400,
  // Photo credits: live list of stored photos, changes when a harvest run lands.
  "/credits": 3600,
  // Itinerary templates: static template data, same HTML for every visitor (changes only on deploy).
  "/templates": 86400,
  "/sign-in": 86400,
  "/sign-up": 86400,
  "/forgot-password": 86400,
  // Spot submission form: static client page (the share-target ?url= query bypasses).
  "/spots/submit": 86400,
  "/spots": 300,
  // Viral events: the index and one page per event, from the scout's R2 feed (refreshed every 2 hours).
  "/trending": 300,
  // Planner: server-rendered city list, revalidated every 5 minutes (app/itineraries/new).
  "/itineraries/new": 300,
  // Free-trip preview: static client page (the trip lives in localStorage, Save/checkout run on the client),
  // same HTML for every visitor; the ?payment=success return bypasses. Changes only on deploy (the key carries the version).
  // A visitor with the server draft cookie gets their own trip in the HTML: see PER_VISITOR_COOKIES.
  "/itineraries/preview": 86400,
  "/api/cities": 300,
  "/api/spots/pins": 300,
  // Sitemap index: read from D1 on every request otherwise (crawlers fetch it often); an hour matches its s-maxage.
  "/sitemap.xml": 3600,
};
// Spot detail pages: live public data like the catalog. Only the plain UUID path; any query
// (e.g. the preview-only data_candidate) bypasses the cache.
const SPOT_DETAIL_PATH = /^\/spots\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// One hour, as the page's own data cache (unstable_cache revalidate 3600, tag "spots"): crawlers walk thousands of
// spot URLs, and a 5-minute TTL left most of them MISS. Reviews load client-side; a deploy changes the key (purge).
const SPOT_DETAIL_TTL_SECONDS = 3600;
const LIVE_DETAIL_TTL_SECONDS = 300;
// Per-spot share card PNG (app/spots/[id]/og): drawn from name/category/score only, so a week is fine; a deploy re-keys.
const SPOT_OG_PATH = /^\/spots\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/og$/;
const SPOT_OG_TTL_SECONDS = 604800;
const VIRAL_EVENT_PATH = /^\/trending\/[a-z0-9][a-z0-9-]{2,95}$/;
// One map pin card ("/api/spots/pins/<id prefix>"), no query.
const PIN_CARD_PATH = /^\/api\/spots\/pins\/[0-9a-f-]{8,36}$/;
// Child sitemaps (app/sitemaps/[file], same names as parseSitemapFile); a missing spots chunk is a 404 and never stored.
const SITEMAP_CHILD_PATH = /^\/sitemaps\/(?:pages|guides|spots-[1-9]\d{0,3})\.xml$/;
const SITEMAP_TTL_SECONDS = 3600;
const isSitemap = (pathname: string) => pathname === "/sitemap.xml" || SITEMAP_CHILD_PATH.test(pathname);

export function edgeTtlSeconds(pathname: string): number | undefined {
  if (Object.hasOwn(EDGE_HTML_TTL_SECONDS, pathname)) return EDGE_HTML_TTL_SECONDS[pathname];
  if (SPOT_DETAIL_PATH.test(pathname)) return SPOT_DETAIL_TTL_SECONDS;
  if (SPOT_OG_PATH.test(pathname)) return SPOT_OG_TTL_SECONDS;
  if (SITEMAP_CHILD_PATH.test(pathname)) return SITEMAP_TTL_SECONDS;
  return VIRAL_EVENT_PATH.test(pathname) || PIN_CARD_PATH.test(pathname) ? LIVE_DETAIL_TTL_SECONDS : undefined;
}

// The only query the edge keys on: one enabled-city slug, so the key set stays bounded.
const EDGE_SPOTS_CITIES = new Set(ENABLED_CITIES.map((city) => city.slug));
const EDGE_SPOTS_VIEWS = new Set(["map", "list"]);
// Auth pages: besides the plain path, only the money-path returns (Save on the free-trip preview, the planner
// resume, a pricing plan -> Stripe). The server HTML differs per redirect (headline + form links), so the key
// carries the exact value; any other redirect stays uncached, which keeps the key set at 2 x 6 entries.
const AUTH_PATHS = new Set(["/sign-up", "/sign-in"]);
export const EDGE_AUTH_REDIRECTS: ReadonlySet<string> = new Set([
  "/itineraries/preview",
  "/itineraries/new?resume=1",
  ...["pro", "premium"].flatMap((tier) => ["monthly", "yearly"].map((cycle) => `/pricing?checkout=${tier}-${cycle}`)),
]);
export const EDGE_CACHE_HEADER = "x-localley-edge-cache";
const ORIGIN_CACHE_CONTROL = "x-localley-origin-cache-control";

type Handler = (request: Request) => Promise<Response>;

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

// Cookies that make a cached path render per visitor. Such a request never reads or writes the shared entry:
// on 2026-11-15 the preview HTML of one draft holder (cookie `lly_draft`, lib/trips/preview-draft-store.ts) was
// stored under the shared key and served to every visitor. The key ignores cookies, so the request must bypass.
export const PER_VISITOR_COOKIES: Record<string, readonly string[]> = {
  "/itineraries/preview": ["lly_draft"],
};

function hasCookie(request: Request, names: readonly string[]): boolean {
  const header = request.headers.get("cookie");
  if (!header) return false;
  return header.split(";").some((part) => {
    const [name, ...value] = part.trim().split("=");
    return names.includes(name) && value.join("=").length > 0;
  });
}

export function isEdgeCacheable(request: Request): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (edgeTtlSeconds(url.pathname) === undefined || !cacheableQuery(url)) return false;
  const perVisitor = PER_VISITOR_COOKIES[url.pathname];
  if (perVisitor && hasCookie(request, perVisitor)) return false;
  // RSC and router-prefetch requests return flight data, not HTML (see Next's Vary header).
  for (const name of request.headers.keys()) {
    if (name === "rsc" || name.startsWith("next-router-")) return false;
  }
  return true;
}

function cacheableQuery(url: URL): boolean {
  if (url.pathname === "/api/cities") return url.search === "?minSpots=1";
  if (!url.search) return true;
  if (AUTH_PATHS.has(url.pathname)) {
    const keys = [...url.searchParams.keys()];
    return keys.length === 1 && keys[0] === "redirect_url" && EDGE_AUTH_REDIRECTS.has(url.searchParams.get("redirect_url") ?? "");
  }
  if (url.pathname === "/api/spots/pins") {
    // Only one enabled city; other filters are open-ended text and stay uncached at the edge.
    const keys = [...url.searchParams.keys()];
    return keys.length === 1 && keys[0] === "city" && EDGE_SPOTS_CITIES.has(url.searchParams.get("city") ?? "");
  }
  if (url.pathname !== "/spots") return false;
  // An enabled city and/or the map or list view, each at most once (the view is a shared public page too).
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.some((key) => key !== "city" && key !== "view")) return false;
  const city = url.searchParams.get("city");
  const view = url.searchParams.get("view");
  return (city === null || EDGE_SPOTS_CITIES.has(city)) && (view === null || EDGE_SPOTS_VIEWS.has(view));
}

export function edgeCacheKey(request: Request, version: string): Request {
  const url = new URL(request.url);
  const city = url.searchParams.get("city");
  const view = url.searchParams.get("view");
  const redirect = AUTH_PATHS.has(url.pathname) ? url.searchParams.get("redirect_url") : null;
  const variant = url.pathname === "/api/cities" ? "&minSpots=1"
    : redirect ? `&redirect_url=${encodeURIComponent(redirect)}`
    : `${city ? `&city=${encodeURIComponent(city)}` : ""}${view ? `&view=${encodeURIComponent(view)}` : ""}`;
  return new Request(`${url.origin}${url.pathname}?__edge=${encodeURIComponent(version)}${variant}`);
}

function storable(request: Request, response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  const pathname = new URL(request.url).pathname;
  const expected = pathname.startsWith("/api/") ? "application/json"
    : SPOT_OG_PATH.test(pathname) ? "image/png"
    : isSitemap(pathname) ? "application/xml"
    : "text/html";
  return response.status === 200
    && !response.headers.has("set-cookie")
    && type.startsWith(expected);
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
  if (!storable(request, fresh)) return fresh;
  const stored = new Response(fresh.clone().body, fresh);
  // The Cache API honours Cache-Control on put; visitors still get Next's own header.
  stored.headers.set(ORIGIN_CACHE_CONTROL, fresh.headers.get("cache-control") ?? "");
  stored.headers.set("cache-control", `public, s-maxage=${edgeTtlSeconds(new URL(request.url).pathname)}`);
  waitUntil(cache.put(key, stored).catch(() => undefined));
  const response = new Response(fresh.body, fresh);
  response.headers.set(EDGE_CACHE_HEADER, "MISS");
  return response;
}

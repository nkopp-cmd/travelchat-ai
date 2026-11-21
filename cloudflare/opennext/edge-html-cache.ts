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
import { SESSION_COOKIE_NAMES } from "../../lib/auth/session-cookie";

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
// Photo credits of one city (app/credits/[city], Push AS3): same data and TTL as /credits. Unknown slugs are 404s
// and never stored (only 200 HTML is cached).
const CREDITS_CITY_PATH = /^\/credits\/[a-z0-9][a-z0-9-]{0,63}$/;
const CREDITS_TTL_SECONDS = 3600;
// A-Z list of one city hub (app/spots/a-z/[city], Push CB2): an hour, as its data cache (city-directory-store
// revalidate 3600). Unknown or empty cities are 404s and never stored.
const SPOTS_AZ_PATH = /^\/spots\/a-z\/[a-z0-9][a-z0-9-]{0,63}$/;
// One map pin card ("/api/spots/pins/<id prefix>"), no query.
const PIN_CARD_PATH = /^\/api\/spots\/pins\/[0-9a-f-]{8,36}$/;
// Sitemaps (route handlers app/sitemap.xml and app/sitemaps/[file], same names as parseSitemapFile), kept out of the
// HTML page map above. The index reads D1 on every request otherwise; an hour matches its s-maxage. A missing spots
// chunk is a 404 and never stored.
const SITEMAP_CHILD_PATH = /^\/sitemaps\/(?:pages|guides|spots-[1-9]\d{0,3})\.xml$/;
const SITEMAP_TTL_SECONDS = 3600;
const isSitemap = (pathname: string) => pathname === "/sitemap.xml" || SITEMAP_CHILD_PATH.test(pathname);
// Stored spot photos (app/media/spot/[spotId]/[file]): content-addressed by sha256, so one URL always has the same bytes.
// Without the edge copy every request ran the Worker + a D1 lookup + an R2 read (TTFB 220-330 ms, up to 1.8 s): that is
// the spot hero, the LCP element. The key has no Worker version (a deploy cannot change the bytes), and only the
// immutable answer is stored: a stand-in copy (max-age=3600, the size copy does not exist yet) is never stored.
// A week, like the share card; a takedown removes the D1 row and purges the URL (Cache API entries purge by URL).
export const SPOT_MEDIA_PATH = /^\/media\/spot\/[0-9a-f-]{36}\/[0-9a-f]{64}(?:-w960|-w480|-w144)?\.webp$/;
const SPOT_MEDIA_TTL_SECONDS = 604800;

/** Spot detail HTML (the pages whose cached copy gets the build's critical CSS, critical-css.ts). */
export const isSpotDetailPath = (pathname: string) => SPOT_DETAIL_PATH.test(pathname);

export function edgeTtlSeconds(pathname: string): number | undefined {
  if (Object.hasOwn(EDGE_HTML_TTL_SECONDS, pathname)) return EDGE_HTML_TTL_SECONDS[pathname];
  if (SPOT_DETAIL_PATH.test(pathname)) return SPOT_DETAIL_TTL_SECONDS;
  if (SPOT_OG_PATH.test(pathname)) return SPOT_OG_TTL_SECONDS;
  if (isSitemap(pathname)) return SITEMAP_TTL_SECONDS;
  if (SPOT_MEDIA_PATH.test(pathname)) return SPOT_MEDIA_TTL_SECONDS;
  if (CREDITS_CITY_PATH.test(pathname) || SPOTS_AZ_PATH.test(pathname)) return CREDITS_TTL_SECONDS;
  return VIRAL_EVENT_PATH.test(pathname) || PIN_CARD_PATH.test(pathname) ? LIVE_DETAIL_TTL_SECONDS : undefined;
}

// The only query the edge keys on: one enabled-city slug, so the key set stays bounded.
const EDGE_SPOTS_CITIES = new Set(ENABLED_CITIES.map((city) => city.slug));
const EDGE_SPOTS_VIEWS = new Set(["map", "list"]);
// Auth pages: besides the plain path, only the money-path returns (Save on the free-trip preview, the planner
// resume, a pricing plan -> Stripe). The server HTML differs per redirect (headline + form links), so the key
// carries the exact value; any other redirect stays uncached, which keeps the key set bounded (2 x 12 entries with
// the walls below).
const AUTH_PATHS = new Set(["/sign-up", "/sign-in"]);
// Pages whose server HTML ignores the query: the client reads it after hydration (the planner renders step 0
// for everyone; ?spot=, ?city=, ?template=, ?resume= pick the step in the browser). Every query variant
// shares the plain-path entry, and a miss renders the plain path, so no query value lands in the shared HTML.
const QUERY_FREE_PATHS = new Set(["/itineraries/new"]);
export const EDGE_AUTH_REDIRECTS: ReadonlySet<string> = new Set([
  "/itineraries/preview",
  // Push BH4: the preview Save button sends this exact value (preview-client.tsx); without it the money-path
  // sign-up rendered at the origin on every visit (cold 467 ms, warm 103 ms vs 79 ms on the cached plain page).
  "/itineraries/preview?continue=save",
  "/itineraries/new?resume=1",
  ...["pro", "premium"].flatMap((tier) => ["monthly", "yearly"].map((cycle) => `/pricing?checkout=${tier}-${cycle}`)),
]);
// Push BC3: the fixed signed-out walls (middleware sends /<section> -> /sign-up?redirect_url=/<section>) and the
// account email links (/sign-in?redirect_url=/settings, Push BB1). Their HTML is the same for every visitor
// (lib/auth/auth-copy.ts headline + form links), so each gets its own key: 2 x 6 more entries, still bounded.
// /community/<id> and /users/<id> stay uncached (open-ended values).
// Push BG2: the bottom-nav tab walls (/chat, /itineraries, /profile; auth-copy NAV_COPY) were missing and
// rendered at the origin on every visit (0.6-2.2 s TTFB on /sign-up?redirect_url=/chat).
export const EDGE_AUTH_WALL_REDIRECTS: ReadonlySet<string> = new Set([
  "/dashboard", "/settings", "/community", "/explore", "/leaderboard", "/challenges",
  "/chat", "/itineraries", "/profile",
]);
const isEdgeAuthRedirect = (redirect: string) => EDGE_AUTH_REDIRECTS.has(redirect) || EDGE_AUTH_WALL_REDIRECTS.has(redirect);
export const EDGE_CACHE_HEADER = "x-localley-edge-cache";
const ORIGIN_CACHE_CONTROL = "x-localley-origin-cache-control";

type Handler = (request: Request) => Promise<Response>;

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete?(request: Request): Promise<boolean>;
}

// Cookies that make a cached path render per visitor. Such a request never reads or writes the shared entry:
// on 2026-11-15 the preview HTML of one draft holder (cookie `lly_draft`, lib/trips/preview-draft-store.ts) was
// stored under the shared key and served to every visitor. The key ignores cookies, so the request must bypass.
export const PER_VISITOR_COOKIES: Record<string, readonly string[]> = {
  "/itineraries/preview": ["lly_draft"],
  // Push BB1: the auth pages send a signed-in visitor straight to redirect_url (a 307, never stored). A cached
  // form would hide that from a visitor with a session, so a session cookie skips the shared entry.
  "/sign-in": SESSION_COOKIE_NAMES,
  "/sign-up": SESSION_COOKIE_NAMES,
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
  const url = withoutTracking(new URL(request.url));
  if (edgeTtlSeconds(url.pathname) === undefined || !cacheableQuery(url)) return false;
  const perVisitor = PER_VISITOR_COOKIES[url.pathname];
  if (perVisitor && hasCookie(request, perVisitor)) return false;
  // RSC and router-prefetch requests return flight data, not HTML (see Next's Vary header).
  for (const name of request.headers.keys()) {
    if (name === "rsc" || name.startsWith("next-router-")) return false;
  }
  return true;
}

// Click-tracking keys that ad and social apps append (Instagram/Facebook fbclid + igshid, TikTok ttclid, Google gclid,
// utm_*). The server HTML never reads them (only the browser does, from location.search: lib/referral-point.ts), so a
// URL whose query holds nothing else is the plain page: same cache entry, same render, same critical-CSS rewrite.
// Without this every social/ad click on a spot page missed the cache and got the slow unrewritten HTML (Push AV1).
const TRACKING_KEY = /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|ttclid|twclid|igshid|igsh|si|mc_cid|mc_eid|_ga|_gl)$/;

export function withoutTracking(url: URL): URL {
  if (!url.search) return url;
  const clean = new URL(url);
  for (const key of [...clean.searchParams.keys()]) {
    if (TRACKING_KEY.test(key)) clean.searchParams.delete(key);
  }
  if (clean.searchParams.size === 0) clean.search = "";
  return clean;
}

function cacheableQuery(url: URL): boolean {
  if (url.pathname === "/api/cities") return url.search === "?minSpots=1";
  if (!url.search || QUERY_FREE_PATHS.has(url.pathname)) return true;
  if (AUTH_PATHS.has(url.pathname)) {
    const keys = [...url.searchParams.keys()];
    return keys.length === 1 && keys[0] === "redirect_url" && isEdgeAuthRedirect(url.searchParams.get("redirect_url") ?? "");
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
  const url = withoutTracking(new URL(request.url));
  if (SPOT_MEDIA_PATH.test(url.pathname)) return new Request(`${url.origin}${url.pathname}`);
  if (QUERY_FREE_PATHS.has(url.pathname)) return new Request(`${url.origin}${url.pathname}?__edge=${encodeURIComponent(version)}`);
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
  if (SPOT_MEDIA_PATH.test(pathname)) {
    return response.status === 200 && !response.headers.has("set-cookie") && type.startsWith("image/webp")
      && /\bimmutable\b/.test(response.headers.get("cache-control") ?? "");
  }
  const expected = pathname.startsWith("/api/") ? "application/json"
    : SPOT_OG_PATH.test(pathname) ? "image/png"
    : isSitemap(pathname) ? "application/xml"
    : "text/html";
  return response.status === 200
    && !response.headers.has("set-cookie")
    && type.startsWith(expected);
}

// Push AM5: unknown paths. Every top-level name under app/ (a route, a metadata file or a non-route file) is listed
// here; a path whose first segment is not in this set can only render app/not-found.tsx, a static prerender that is
// the same HTML for every path. So all of them share ONE entry per Worker version (bots cannot grow the key set).
// Before this the 404 ran the full Worker render on every hit (warm TTFB ~200 ms). A test keeps this set equal to app/.
export const APP_TOP_LEVEL_NAMES: ReadonlySet<string> = new Set([
  "admin", "android-chrome-192x192.png", "android-chrome-512x512.png", "api", "apple-icon.png", "apple-touch-icon.png",
  "blog", "challenges", "chat", "community", "credits", "dashboard", "explore", "favicon-16x16.png", "favicon-32x32.png",
  "favicon.ico", "forgot-password", "globals.css", "guide", "help", "icon.png", "itineraries", "layout.tsx",
  "leaderboard", "media", "newsletter", "not-found.tsx", "og", "page.tsx", "pricing", "privacy", "profile",
  "reset-password", "settings", "shared", "sign-in", "sign-up", "sitemap.xml", "sitemaps", "spots", "templates",
  "terms", "trending", "users", "verified",
]);
const NOT_FOUND_TTL_SECONDS = 86400;
const ORIGIN_STATUS = "x-localley-origin-status";

/**
 * A plain GET whose first path segment no app route owns. Excluded, so the middleware still runs for them: queries
 * (verify-link ?error= redirect), the apex host (301 to www), signed-in visitors (account hint cookie), framework
 * paths ("_next", "cdn-cgi" and other "_"/dot names) and RSC/prefetch requests.
 */
export function isUnknownPagePath(request: Request): boolean {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.search || url.hostname !== "www.localley.io") return false;
  const segment = url.pathname.split("/")[1] ?? "";
  if (!segment || APP_TOP_LEVEL_NAMES.has(segment) || /^[_.]|^cdn-cgi$/.test(segment)) return false;
  if (hasCookie(request, SESSION_COOKIE_NAMES)) return false;
  for (const name of request.headers.keys()) {
    if (name === "rsc" || name.startsWith("next-router-")) return false;
  }
  return true;
}

async function serveNotFound(request: Request, version: string, cache: EdgeCache, waitUntil: (promise: Promise<unknown>) => void, handler: Handler) {
  const key = new Request(`${new URL(request.url).origin}/__not-found?__edge=${encodeURIComponent(version)}`);
  const hit = await cache.match(key);
  if (hit) {
    const headers = new Headers(hit.headers);
    headers.set("cache-control", headers.get(ORIGIN_CACHE_CONTROL) ?? "no-store");
    headers.delete(ORIGIN_CACHE_CONTROL);
    headers.delete(ORIGIN_STATUS);
    headers.set(EDGE_CACHE_HEADER, "HIT");
    return new Response(hit.body, { status: 404, headers });
  }
  const rendered = await handler(request);
  // Only the real not-found page: a 404 HTML without cookies. Anything else (a route added without updating the set,
  // an error page) goes to the visitor as is and is never shared.
  if (rendered.status !== 404 || rendered.headers.has("set-cookie") || !(rendered.headers.get("content-type") ?? "").startsWith("text/html")) {
    return rendered;
  }
  // Stored as 200 with the real status in a header: the Cache API stays out of status-specific rules.
  const stored = new Response(rendered.clone().body, { status: 200, headers: rendered.headers });
  stored.headers.set(ORIGIN_STATUS, "404");
  stored.headers.set(ORIGIN_CACHE_CONTROL, rendered.headers.get("cache-control") ?? "");
  stored.headers.set("cache-control", `public, s-maxage=${NOT_FOUND_TTL_SECONDS}`);
  waitUntil(cache.put(key, stored).catch(() => undefined));
  const response = new Response(rendered.body, rendered);
  response.headers.set(EDGE_CACHE_HEADER, "MISS");
  return response;
}

// Stale-while-revalidate (Push AW1). An entry stays in the Cache API for its TTL plus this window; past the TTL a
// visitor gets the stored copy at once (STALE) and this request renders a fresh copy in waitUntil. One refresh per
// stale request, triggered only by a visitor: no timer, no cron, no self-scheduling. Before this, with little real
// traffic, most visitors of spot/city/planner pages got the cold render (0.5-2.6 s TTFB) after a 5-60 min expiry.
export const EDGE_STALE_SECONDS = 86400;
const STORED_AT = "x-localley-stored-at";

export async function serveWithEdgeCache(
  request: Request,
  version: string | undefined,
  cache: EdgeCache,
  waitUntil: (promise: Promise<unknown>) => void,
  handler: Handler,
  // Rewrites a fresh spot detail HTML before it is stored and sent (critical CSS); the cached copy keeps the result.
  rewriteSpotHtml?: (response: Response) => Promise<Response>,
  now: () => number = Date.now,
): Promise<Response> {
  if (version && isUnknownPagePath(request)) return serveNotFound(request, version, cache, waitUntil, handler);
  if (!version || !isEdgeCacheable(request)) return handler(request);
  const key = edgeCacheKey(request, version);
  const ttl = edgeTtlSeconds(withoutTracking(new URL(request.url)).pathname) ?? 0;
  const hit = await cache.match(key);
  if (hit) {
    const storedAt = Number(hit.headers.get(STORED_AT));
    const stale = storedAt > 0 && now() - storedAt > ttl * 1000;
    const response = new Response(hit.body, hit);
    response.headers.set(EDGE_CACHE_HEADER, stale ? "STALE" : "HIT");
    const origin = response.headers.get(ORIGIN_CACHE_CONTROL);
    if (origin) response.headers.set("cache-control", origin);
    response.headers.delete(ORIGIN_CACHE_CONTROL);
    response.headers.delete(STORED_AT);
    if (stale) {
      // The refresh replaces the entry; a page that is gone now (404, error, cookie) drops it, so a removed spot
      // is never served stale for the rest of the window.
      waitUntil(renderAndStore(request, key, ttl, cache, waitUntil, handler, rewriteSpotHtml, now)
        .then((result) => (result.stored ? undefined : cache.delete?.(key)))
        .then(() => undefined, () => undefined));
    }
    return response;
  }
  const { response } = await renderAndStore(request, key, ttl, cache, waitUntil, handler, rewriteSpotHtml, now);
  return response;
}

async function renderAndStore(
  request: Request,
  key: Request,
  ttl: number,
  cache: EdgeCache,
  waitUntil: (promise: Promise<unknown>) => void,
  handler: Handler,
  rewriteSpotHtml: ((response: Response) => Promise<Response>) | undefined,
  now: () => number,
): Promise<{ response: Response; stored: boolean }> {
  const asked = new URL(request.url);
  const url = withoutTracking(asked);
  // A miss renders the cleaned URL, so no tracking value can land in the shared HTML.
  const rendered = await handler(QUERY_FREE_PATHS.has(url.pathname) && url.search
    ? new Request(`${url.origin}${url.pathname}`, request)
    : url.search !== asked.search ? new Request(url.toString(), request) : request);
  if (!storable(request, rendered)) return { response: rendered, stored: false };
  const fresh = rewriteSpotHtml && isSpotDetailPath(url.pathname) ? await rewriteSpotHtml(rendered).catch(() => rendered) : rendered;
  const stored = new Response(fresh.clone().body, fresh);
  // The Cache API honours Cache-Control on put; visitors still get Next's own header.
  stored.headers.set(ORIGIN_CACHE_CONTROL, fresh.headers.get("cache-control") ?? "");
  stored.headers.set("cache-control", `public, s-maxage=${ttl + EDGE_STALE_SECONDS}`);
  stored.headers.set(STORED_AT, String(now()));
  waitUntil(cache.put(key, stored).catch(() => undefined));
  const response = new Response(fresh.body, fresh);
  response.headers.set(EDGE_CACHE_HEADER, "MISS");
  return { response, stored: true };
}

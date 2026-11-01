import { NextResponse, type NextRequest } from "next/server";
import { hasValidSessionCookie } from "@/lib/auth/session-cookie";

// Public routes that don't require authentication. Patterns follow the old Clerk
// createRouteMatcher list: "(.*)" = any suffix, ":id" = one path segment.
const PUBLIC_ROUTES = [
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/forgot-password',
    '/reset-password',
    '/api/auth(.*)',  // Better Auth endpoints (sign-in, sign-up, callbacks, get-session)
    '/api/test-auth(.*)',  // Preview-only test mailbox; the route returns 404 unless AUTH_MAIL_MODE=outbox
    '/api/webhooks(.*)',
    '/api/subscription/webhook',  // Stripe webhook — must be public (no cookies on Stripe POST)
    '/api/connect/webhook',  // Stripe Connect webhook — must be public (no cookies on Stripe POST)
    '/guide/apply',  // Allow browsing the guide application page
    '/pricing(.*)',  // Allow anonymous users to see pricing
    '/help(.*)',  // Static phrase cards for travellers (no account data)
    '/privacy',  // Public privacy policy (Google OAuth branding needs it without sign-in)
    '/terms',  // Public terms of use
    '/trending',  // Public viral-event index (R2 feed of public news sources)
    '/trending/:slug',  // Public viral-event page
    '/itineraries/preview', // Browser-only generated itinerary; no account data
    '/itineraries/new',  // Allow anonymous itinerary creation (1 free)
    '/api/itineraries/generate',  // Allow anonymous generation API
    '/api/itineraries/demo',  // Demo itinerary endpoint
    '/api/cities',  // City listing for destination picker (must work for anonymous users)
    '/api/conditions',  // Season + weather chips for the landing picks; fixed city list, cached
    '/api/conditions/:city',  // Planner trip outlook: season table + MET forecast for one reviewed city, cached
    '/api/events/spots',  // Spot-card analytics beacon: same-origin, bounded daily aggregates, no user data
    '/api/version',  // Release proof: the deployed commit sha (Gravity release lane smoke check)
    '/api/itineraries/:id/story/media/:generation/:slide',  // Story slides: the route enforces owner/shared + unexpired.
    '/api/places/naver-local', // Bounded public KR name/address references; no app writes
    '/api/places/photo',  // Public spot image proxy; API key stays server-side
    '/api/spots/social-submissions(.*)',  // Public intake/status; server routes handle validation and rate limits
    '/api/cron/cleanup-stories',  // Cron; route enforces CRON_SECRET
    '/api/cron/process-social-submissions',  // Cron; route enforces CRON_SECRET
    '/api/cron/discover-spots-with-apify',  // Cron; route enforces CRON_SECRET
    '/api/cron/refresh-weekly-social-trends',  // Cron; route enforces CRON_SECRET
    '/api/cron/ai-provider-probe',  // Cron; route enforces CRON_SECRET
    '/spots(.*)',  // Allow browsing spots without login
    '/templates(.*)',  // Allow browsing templates
    '/itineraries/:id/stories',  // Public stories download page
    '/api/itineraries/:id/story',  // The route enforces owner/public access before rendering.
    '/media/activity/:file',  // Public AI activity thumbnails (R2, hash names only)
    '/media/spot/:spotId/:file',  // Public own spot photos (R2, rows in spot_photos only)
];

const toRegExp = (pattern: string) =>
    new RegExp(`^${pattern
        .split("(.*)")
        .map((part) => part.replace(/[.+?^${}()|[\]\\*]/g, "\\$&").replace(/:[A-Za-z]+/g, "[^/]+"))
        .join(".*")}/?$`);

const PUBLIC_MATCHERS = PUBLIC_ROUTES.map(toRegExp);

export const isPublicRoute = (request: NextRequest) =>
    PUBLIC_MATCHERS.some((matcher) => matcher.test(request.nextUrl.pathname)) ||
    (request.method === 'GET' && request.nextUrl.hostname === 'localley-next-preview.nkopp.workers.dev' &&
        request.nextUrl.searchParams.get('data_candidate') === 'd1' &&
        process.env.AUTH_MAIL_MODE === 'outbox' && process.env.SUPABASE_READ_ONLY === 'true' &&
        /^\/shared\/[a-z0-9]{8}\/?$/.test(request.nextUrl.pathname)) ||
    (request.method === 'GET' && request.nextUrl.hostname === 'localley-next-preview.nkopp.workers.dev' &&
        /^\/api\/itineraries\/[^/]+\/story\/media\/[^/]+\/[^/]+\/?$/.test(request.nextUrl.pathname)) ||
    (request.method === 'GET' && /^\/api\/spots\/[^/]+\/(?:reviews|photos)\/?$/.test(request.nextUrl.pathname));

// Vercel redirected the apex to www; keep that on Cloudflare so there is one canonical
// host and one Better Auth cookie. Only the exact apex host is redirected (not
// next.localley.io or the cron self-reference host).
export const apexRedirect = (request: NextRequest) => {
    if (request.nextUrl.hostname !== 'localley.io') return null;
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://www.localley.io');
    return NextResponse.redirect(target, 301);
};

// Supabase exit gate 3 (shared/plans/localley-decisions.md 2026-10-24): during the final import every mutating request
// (API, Server Actions, webhooks) gets 503 + Retry-After, so nothing is written to either store and Stripe retries.
// Sign-in stays open: Better Auth lives in AUTH_DB, outside the move.
export const writeFreeze = (request: NextRequest) => {
    if (process.env.DATA_WRITE_FREEZE !== 'true' || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;
    if (/^\/api\/auth(?:\/|$)/.test(request.nextUrl.pathname)) return null;
    return NextResponse.json({ error: "Localley is moving to a new database. Please try again in a few minutes.", code: "write_freeze" }, {
        status: 503, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' },
    });
};

export default async function middleware(request: NextRequest) {
    const redirect = apexRedirect(request);
    if (redirect) return redirect;
    const frozen = writeFreeze(request);
    if (frozen) return frozen;
    // The landing page has no Server Actions or mutation contract. Refuse before
    // Next.js can decode an unsolicited action/form body or enter its renderer.
    if (request.nextUrl.pathname === '/' && !['GET', 'HEAD'].includes(request.method)) {
        return NextResponse.json({ error: "Method not allowed" }, {
            status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' },
        });
    }
    if (isPublicRoute(request)) return NextResponse.next();
    if (await hasValidSessionCookie(request.headers, process.env.BETTER_AUTH_SECRET)) return NextResponse.next();

    if (/^\/(?:api|trpc)(?:\/|$)/.test(request.nextUrl.pathname)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const signIn = new URL('/sign-in', request.url);
    signIn.searchParams.set('redirect_url', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(signIn, 307);
}

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|json|txt|xml|jpe?g|webp|avif|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};

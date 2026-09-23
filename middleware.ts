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
    '/itineraries/new',  // Allow anonymous itinerary creation (1 free)
    '/api/itineraries/generate',  // Allow anonymous generation API
    '/api/itineraries/demo',  // Demo itinerary endpoint
    '/api/cities',  // City listing for destination picker (must work for anonymous users)
    '/api/places/photo',  // Public spot image proxy; API key stays server-side
    '/api/spots/social-submissions(.*)',  // Public intake/status; server routes handle validation and rate limits
    '/api/cron/cleanup-stories',  // Cron; route enforces CRON_SECRET
    '/api/cron/process-social-submissions',  // Cron; route enforces CRON_SECRET
    '/api/cron/discover-spots-with-apify',  // Cron; route enforces CRON_SECRET
    '/api/cron/refresh-weekly-social-trends',  // Cron; route enforces CRON_SECRET
    '/spots(.*)',  // Allow browsing spots without login
    '/templates(.*)',  // Allow browsing templates
    '/itineraries/:id/stories',  // Public stories download page
    '/api/itineraries/:id/story',  // The route enforces owner/public access before rendering.
];

const toRegExp = (pattern: string) =>
    new RegExp(`^${pattern
        .split("(.*)")
        .map((part) => part.replace(/[.+?^${}()|[\]\\*]/g, "\\$&").replace(/:[A-Za-z]+/g, "[^/]+"))
        .join(".*")}/?$`);

const PUBLIC_MATCHERS = PUBLIC_ROUTES.map(toRegExp);

export const isPublicRoute = (request: NextRequest) =>
    PUBLIC_MATCHERS.some((matcher) => matcher.test(request.nextUrl.pathname)) ||
    (request.method === 'GET' && /^\/api\/spots\/[^/]+\/(?:reviews|photos)\/?$/.test(request.nextUrl.pathname));

// Vercel redirected the apex to www; keep that on Cloudflare so there is one canonical
// host and one Better Auth cookie. Only the exact apex host is redirected (not
// next.localley.io or the cron self-reference host).
export const apexRedirect = (request: NextRequest) => {
    if (request.nextUrl.hostname !== 'localley.io') return null;
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, 'https://www.localley.io');
    return NextResponse.redirect(target, 301);
};

export default async function middleware(request: NextRequest) {
    const redirect = apexRedirect(request);
    if (redirect) return redirect;
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
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|json|txt|xml|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};

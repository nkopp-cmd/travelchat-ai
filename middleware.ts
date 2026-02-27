import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/api/webhooks(.*)',
    '/api/subscription/webhook',  // Stripe webhook — must be public (no cookies on Stripe POST)
    '/pricing(.*)',  // Allow anonymous users to see pricing
    '/itineraries/new',  // Allow anonymous itinerary creation (1 free)
    '/api/itineraries/generate',  // Allow anonymous generation API
    '/api/itineraries/demo',  // Demo itinerary endpoint
    '/api/cities',  // City listing for destination picker (must work for anonymous users)
    '/spots(.*)',  // Allow browsing spots without login
    '/templates(.*)',  // Allow browsing templates
    '/itineraries/:id/stories',  // Public stories download page
    '/api/itineraries/:id/story',  // Story render (PNG) — no auth needed, used by save route internally
]);

export default clerkMiddleware(async (auth, request) => {
    if (!isPublicRoute(request)) {
        await auth.protect();
    }
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};

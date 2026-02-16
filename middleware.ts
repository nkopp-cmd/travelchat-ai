import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/api/webhooks(.*)',
    '/itineraries/new',  // Allow anonymous itinerary creation (1 free)
    '/api/itineraries/generate',  // Allow anonymous generation API
    '/api/itineraries/demo',  // Demo itinerary endpoint
    '/api/cities',  // City listing for destination picker (must work for anonymous users)
    '/spots(.*)',  // Allow browsing spots without login
    '/templates(.*)',  // Allow browsing templates
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

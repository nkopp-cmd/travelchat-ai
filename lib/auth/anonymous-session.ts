import { getSessionCookieValue } from "@/lib/auth/session-cookie";

// Push DM1: anonymous get-session calls (crawlers, signed-out visitors) answered Better Auth's own
// "no session" body (null) after a full Better Auth init: ~240 ms CPU p50. Without a session
// cookie the answer is always null, so skip the init.
export function anonymousGetSession(request: Request): Response | null {
    if (request.method !== "GET") return null;
    if (!new URL(request.url).pathname.endsWith("/api/auth/get-session")) return null;
    if (getSessionCookieValue(request.headers)) return null;
    return new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
}

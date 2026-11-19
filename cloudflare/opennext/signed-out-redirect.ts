/**
 * Push AW2: signed-out visitors on the private top-level pages get the same 307 to the sign-up (or sign-in) form
 * that middleware.ts sends, but from the Worker entry, before the OpenNext handler starts (~120-240 ms -> edge
 * time). Only exact page paths with no session cookie at all take this path; any session cookie (valid or not),
 * any `error` query (verify-link handling), other methods, the apex host and every other path go to the full app.
 * __tests__/cloudflare-signed-out-redirect.test.ts proves the answer equals the middleware answer for each path.
 */
import { hasAccountHint, SESSION_COOKIE_NAMES } from "../../lib/auth/session-cookie";

export const FAST_REDIRECT_PATHS = new Set([
  "/dashboard", "/settings", "/profile", "/itineraries", "/chat", "/explore", "/challenges", "/leaderboard",
  "/community",
]);

const SECURITY_HEADERS: Record<string, string> = {
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
};

function hasSessionCookie(headers: Headers): boolean {
  const cookie = headers.get("cookie");
  if (!cookie) return false;
  return cookie.split(";").some((part) => {
    const name = part.split("=")[0].trim();
    return (SESSION_COOKIE_NAMES as readonly string[]).includes(name);
  });
}

export function signedOutRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.hostname === "localley.io" || !FAST_REDIRECT_PATHS.has(url.pathname) || url.searchParams.has("error")) return null;
  if (hasSessionCookie(request.headers)) return null;
  const form = hasAccountHint(request.headers) ? "/sign-in" : "/sign-up";
  const location = `${form}?${new URLSearchParams({ redirect_url: url.pathname + url.search })}`;
  return new Response(null, { status: 307, headers: { location, "x-localley-edge-redirect": "1", ...SECURITY_HEADERS } });
}

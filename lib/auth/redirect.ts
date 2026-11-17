/**
 * Redirect helpers shared by client forms, the middleware and the /verified route (no "use client").
 */

/** Only same-site paths; blocks //evil.com and backslash tricks. */
export function safeRedirect(target: string | null | undefined, fallback = "/dashboard"): string {
  if (!target) return fallback;
  return target.startsWith("/") && !target.startsWith("//") && !/[\\\r\n\t]/.test(target) ? target : fallback;
}

/**
 * Better Auth sends an expired or used verify link to `callbackURL?error=<code>`. Static pages
 * (/pricing, /help, /blog) are Cloudflare assets that never reach the middleware, so the error was
 * lost there. Verify mails therefore return through this Worker route: the middleware sees the
 * error on /verified, and on success the route forwards to the real page.
 */
export const VERIFIED_PATH = "/verified";

export function verifiedCallbackURL(page: string): string {
  return `${VERIFIED_PATH}?to=${encodeURIComponent(safeRedirect(page))}`;
}

/**
 * Edge-safe session cookie check for middleware (no database, no Better Auth import).
 *
 * Better Auth signs the session cookie as `<token>.<base64 HMAC-SHA256(secret, token)>`.
 * A valid signature proves the cookie was issued by this app. Route handlers and
 * pages still load the full session (lib/auth/server.ts) before reading user data,
 * so a revoked or expired session gets 401 / sign-in there.
 */
export const SESSION_COOKIE_NAMES = ["__Secure-better-auth.session_token", "better-auth.session_token"] as const;

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function getSessionCookieValue(headers: Headers): string | null {
  const cookie = headers.get("cookie");
  for (const name of SESSION_COOKIE_NAMES) {
    const value = readCookie(cookie, name);
    if (value) return value;
  }
  return null;
}

export async function hasValidSessionCookie(headers: Headers, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const raw = getSessionCookieValue(headers);
  if (!raw) return false;
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return false;
  }
  const dot = value.lastIndexOf(".");
  if (dot < 1) return false;
  const token = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (signature.length !== 44 || !signature.endsWith("=")) return false;
  try {
    const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(token));
  } catch {
    return false;
  }
}

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { authHosts, getSession } from "@/lib/auth/server";
import { AuthNotificationStore, type NotificationDatabase } from "./auth-store";
import { isObject, notificationId, parseNotificationPage, parsePreferencePatch,
  parsePushEndpoint, parsePushSubscription, readNotificationBody } from "./validation";

type Resource = "preferences" | "inbox" | "notification" | "push";
type Mode = "readonly" | "active";
function bindings(): Record<string, unknown> | undefined {
  return (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)
    [Symbol.for("__cloudflare-context__")]?.env;
}
function headers(mode?: Mode) {
  return { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Localley-Data-Source": "auth-d1",
    "X-Localley-Notification-Writable": String(mode === "active") };
}
function response(value: unknown, mode?: Mode, status = 200) {
  return NextResponse.json(value, { status, headers: headers(mode) });
}
function expiry(value: unknown): number {
  if (typeof value === "number") return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string") return /^\d{10,13}$/.test(value) ? expiry(Number(value)) : Date.parse(value);
  return NaN;
}

/** Existing preview routing runs first. Missing/off means legacy; selected-store failure never does.
 * This flag is read only from the actual request's Worker environment, not bundled .env defaults.
 */
export async function authNotificationResponse(request: NextRequest | undefined, userId: string,
  resource: Resource, id?: string): Promise<NextResponse | null> {
  const env = bindings(), selected = env?.AUTH_NOTIFICATION_STORAGE;
  if (selected === undefined || selected === "off") return null;
  const mode = selected === "readonly" || selected === "active" ? selected : undefined;
  try {
    if (!mode || !request) throw Error("configuration");
    const db = env?.AUTH_DB as NotificationDatabase | undefined;
    if (!db || typeof db.prepare !== "function") throw Error("binding");
    if (request.nextUrl.protocol !== "https:" || !authHosts().includes(request.nextUrl.hostname)) {
      return response({ error: "Notifications are unavailable on this host." }, mode, 403);
    }
    const session = await getSession(request.headers);
    if (!session || session.user.id !== userId || !session.user.emailVerified) {
      return response({ error: "A verified account is required." }, mode, 403);
    }
    // Cookie caching must not admit a revoked session or a newly unverified/deleted user.
    const actual = await db.prepare(`SELECT s.id, s.expiresAt FROM session s
      JOIN "user" u ON u.id = s.userId AND u.emailVerified = 1
      WHERE s.id = ? AND s.userId = ?`).bind(session.session.id, userId)
      .first<{ id: string; expiresAt: unknown }>();
    if (actual?.id !== session.session.id || !(expiry(actual.expiresAt) > Date.now())) {
      return response({ error: "A current verified session is required." }, mode, 403);
    }
    const method = request.method;
    if (method !== "GET") {
      if (request.headers.get("origin") !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") {
        return response({ error: "Invalid request origin." }, mode, 403);
      }
      if (mode !== "active") return response({ error: "Notification settings are temporarily read-only." }, mode, 503);
    }
    const store = new AuthNotificationStore(db, userId);
    const invalid = () => response({ error: "Invalid notification request." }, mode, 400);
    if (resource === "preferences") {
      if (method === "GET") return response({ ...await store.getPreferences(), storageWritable: mode === "active", deliveryEnabled: false }, mode);
      if (method === "PATCH") {
        const patch = parsePreferencePatch(await readNotificationBody(request));
        if (!patch) return invalid();
        return response({ ...await store.updatePreferences(patch), storageWritable: true, deliveryEnabled: false }, mode);
      }
    } else if (resource === "inbox") {
      if (method === "GET") {
        const page = parseNotificationPage(request.nextUrl.searchParams);
        if (!page) return invalid();
        return response({ ...await store.inbox(page), storageWritable: mode === "active" }, mode);
      }
      if (method === "POST") {
        const body = await readNotificationBody(request);
        if (!isObject(body) || Object.keys(body).length !== 1 || body.action !== "markAllRead") return invalid();
        return response({ success: await store.markRead() }, mode);
      }
    } else if (resource === "notification") {
      if (!id || !notificationId(id)) return invalid();
      if (method === "PATCH") return response({ success: await store.markRead(id) }, mode);
      if (method === "DELETE") return response({ success: await store.delete(id) }, mode);
    } else if (resource === "push") {
      if (method === "POST") {
        const subscription = await parsePushSubscription(await readNotificationBody(request));
        if (!subscription) return invalid();
        await store.savePush(subscription);
        return response({ success: true, deliveryEnabled: false }, mode);
      }
      if (method === "DELETE") {
        const body = await readNotificationBody(request);
        if (!isObject(body) || Object.keys(body).length !== 1) return invalid();
        const endpoint = parsePushEndpoint(body.endpoint);
        if (!endpoint) return invalid();
        await store.removePush(endpoint);
        return response({ success: true, deliveryEnabled: false }, mode);
      }
    }
    return response({ error: "Method not allowed." }, mode, 405);
  } catch {
    // Never log bound private endpoint/key values or raw provider diagnostics.
    console.error("[AUTH_NOTIFICATIONS] storage unavailable");
    return response({ error: "notifications_unavailable", message: "Notification storage is currently unavailable." }, mode, 503);
  }
}

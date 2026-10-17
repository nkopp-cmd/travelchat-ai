import type { NotificationPreferences } from "@/types";

export const preferenceFlags = ["pushEnabled", "emailEnabled", "achievements", "levelUps", "newSpots",
  "social", "challenges", "weeklyDigest", "system"] as const;
export type PreferencePatch = Partial<Omit<NotificationPreferences, "clerkUserId" | "quietHoursStart" | "quietHoursEnd">>
  & { quietHoursStart?: string | null; quietHoursEnd?: string | null };
const preferenceKeys: readonly string[] = [...preferenceFlags, "quietHoursStart", "quietHoursEnd", "timezone"];
export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fields = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every(key => allowed.includes(key));
export const validQuietTime = (v: unknown) => v === null || (typeof v === "string"
  && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(v));
export function validTimezone(v: unknown): boolean {
  if (typeof v !== "string" || !v || v.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; }
  catch { return false; }
}
export function parsePreferencePatch(value: unknown): PreferencePatch | null {
  if (!isObject(value) || !Object.keys(value).length || !fields(value, preferenceKeys)) return null;
  if (preferenceFlags.some(key => key in value && typeof value[key] !== "boolean")) return null;
  if (["quietHoursStart", "quietHoursEnd"].some(key => key in value && !validQuietTime(value[key]))) return null;
  if ("timezone" in value && !validTimezone(value.timezone)) return null;
  return value as PreferencePatch;
}
export interface NotificationPage { limit: number; offset: number; unreadOnly: boolean }
export function parseNotificationPage(params: URLSearchParams): NotificationPage | null {
  const rawLimit = params.get("limit") ?? "20", rawOffset = params.get("offset") ?? "0";
  const rawUnread = params.get("unreadOnly") ?? "false";
  if (!["limit", "offset", "unreadOnly"].every(key => params.getAll(key).length <= 1)
    || !/^[1-9][0-9]*$/.test(rawLimit) || !/^(0|[1-9][0-9]*)$/.test(rawOffset)
    || !["true", "false"].includes(rawUnread)) return null;
  const limit = Number(rawLimit), offset = Number(rawOffset);
  return Number.isSafeInteger(limit) && limit <= 50 && Number.isSafeInteger(offset) && offset <= 1000
    ? { limit, offset, unreadOnly: rawUnread === "true" } : null;
}
export const notificationId = (id: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

export interface StoredPushInput { endpoint: string; keys: { p256dh: string; auth: string } }
export function parsePushEndpoint(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || /[\x00-\x20\x7f]/.test(value)) return null;
    return value;
  } catch { return null; }
}
function keyBytes(value: unknown, size: number): Uint8Array<ArrayBuffer> | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 100) return null;
  try {
    const bytes = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0));
    const canonical = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    return bytes.length === size && canonical === value ? bytes : null;
  } catch { return null; }
}
export async function parsePushSubscription(value: unknown): Promise<StoredPushInput | null> {
  if (!isObject(value) || !fields(value, ["subscription"]) || !isObject(value.subscription)) return null;
  const sub = value.subscription;
  if (!fields(sub, ["endpoint", "keys", "expirationTime"]) || !isObject(sub.keys)
    || !fields(sub.keys, ["p256dh", "auth"]) || ("expirationTime" in sub && sub.expirationTime !== null)) return null;
  const endpoint = parsePushEndpoint(sub.endpoint), p256dh = keyBytes(sub.keys.p256dh, 65), auth = keyBytes(sub.keys.auth, 16);
  if (!endpoint || !p256dh || p256dh[0] !== 4 || !auth) return null;
  try { await crypto.subtle.importKey("raw", p256dh, { name: "ECDH", namedCurve: "P-256" }, false, []); }
  catch { return null; }
  return { endpoint, keys: { p256dh: sub.keys.p256dh as string, auth: sub.keys.auth as string } };
}

/** Bound bytes before decoding. A forged Content-Length must not bypass this limit. */
export async function readNotificationBody(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > 8192) { await reader.cancel(); return null; }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

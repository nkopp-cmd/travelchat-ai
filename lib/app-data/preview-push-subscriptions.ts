import "server-only";
import { ensureOwnerId, newOwnerId, ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";

interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const fields = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every(key => allowed.includes(key));

export function parsePreviewPushEndpoint(value: unknown): string | null {
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

export async function parsePreviewPushSubscription(value: unknown): Promise<PushSubscriptionInput | null> {
  if (!object(value) || !fields(value, ["subscription"]) || !object(value.subscription)) return null;
  const subscription = value.subscription;
  if (!fields(subscription, ["endpoint", "keys", "expirationTime"]) || !object(subscription.keys)
    || !fields(subscription.keys, ["p256dh", "auth"]) || ("expirationTime" in subscription && subscription.expirationTime !== null)) return null;
  const endpoint = parsePreviewPushEndpoint(subscription.endpoint);
  const p256dh = keyBytes(subscription.keys.p256dh, 65), auth = keyBytes(subscription.keys.auth, 16);
  if (!endpoint || !p256dh || p256dh[0] !== 4 || !auth) return null;
  try { await crypto.subtle.importKey("raw", p256dh, { name: "ECDH", namedCurve: "P-256" }, false, []); }
  catch { return null; }
  return { endpoint, keys: { p256dh: subscription.keys.p256dh as string, auth: subscription.keys.auth as string } };
}

async function freshOwner(userId: string): Promise<string> {
  const owners = await ownerIds(userId);
  if (owners.legacy) throw Error("Preview push storage unavailable");
  const ownerId = owners.fresh ?? await ensureOwnerId(userId);
  if (ownerId !== newOwnerId(userId)) throw Error("Preview push storage unavailable");
  return ownerId;
}
async function endpointHash(endpoint: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}

/** Storage only. No sender reads this isolated table. All guards share the atomic write. */
export async function savePreviewPushSubscription(userId: string, input: PushSubscriptionInput): Promise<void> {
  const ownerId = await freshOwner(userId), hash = await endpointHash(input.endpoint);
  const result = await previewAppDataReader().prepare(`INSERT INTO preview_push_subscriptions
    (endpointSha256, ownerId, endpoint, p256dh, auth)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')
    AND NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?)
    AND ((SELECT count(*) FROM preview_push_subscriptions WHERE ownerId = ?) < 10
      OR EXISTS (SELECT 1 FROM preview_push_subscriptions WHERE ownerId = ? AND endpointSha256 = ?))
    ON CONFLICT(endpointSha256) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
    WHERE preview_push_subscriptions.ownerId = excluded.ownerId
    AND preview_push_subscriptions.endpoint = excluded.endpoint
    AND EXISTS (SELECT 1 FROM owners WHERE id = excluded.ownerId AND source = 'new')
    AND NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?)`)
    .bind(hash, ownerId, input.endpoint, input.keys.p256dh, input.keys.auth,
      ownerId, userId, ownerId, ownerId, hash, userId).run();
  if (result.meta.changes !== 1) throw Error("Preview push storage unavailable");
}

export async function removePreviewPushSubscription(userId: string, endpoint: string): Promise<void> {
  const ownerId = await freshOwner(userId), hash = await endpointHash(endpoint);
  await previewAppDataReader().prepare(`DELETE FROM preview_push_subscriptions WHERE ownerId = ?
    AND endpointSha256 = ? AND endpoint = ?
    AND EXISTS (SELECT 1 FROM owners WHERE id = ? AND source = 'new')
    AND NOT EXISTS (SELECT 1 FROM legacy_owners WHERE clerkUserId = ?)`)
    .bind(ownerId, hash, endpoint, ownerId, userId).run();
}

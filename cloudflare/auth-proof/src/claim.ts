import { Buffer } from "node:buffer";

export async function redeemClaim(env: Env, token: string, userId: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const [encoded, signature] = parts;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.CLAIM_SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    if (!await crypto.subtle.verify("HMAC", key, Buffer.from(signature, "base64url"), new TextEncoder().encode(encoded))) return false;
    const payload: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || !("authUserId" in payload) || !("legacyOwnerId" in payload)
      || !("expiresAt" in payload) || !("nonce" in payload)) return false;
    const { authUserId, legacyOwnerId, expiresAt, nonce } = payload;
    if (authUserId !== userId || typeof legacyOwnerId !== "string" || typeof nonce !== "string"
      || typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) return false;
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))).toString("hex");
    // D1 batch is atomic. No mapping can change, and only the winning insert consumes the grant.
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO identity_links (authUserId, ownerId)
        SELECT g.authUserId, g.legacyOwnerId FROM claim_grants g JOIN owners o ON o.id = g.legacyOwnerId
        WHERE g.tokenHash = ? AND g.authUserId = ? AND g.legacyOwnerId = ? AND g.expiresAt = ?
        AND g.nonce = ? AND g.expiresAt > CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER)
        AND g.consumedAt IS NULL AND o.source = 'legacy-fixture'
        AND NOT EXISTS (SELECT 1 FROM identity_links WHERE authUserId = g.authUserId OR ownerId = g.legacyOwnerId)`)
        .bind(hash, userId, legacyOwnerId, expiresAt, nonce),
      env.DB.prepare("UPDATE claim_grants SET consumedAt = CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER) WHERE tokenHash = ? AND consumedAt IS NULL AND changes() = 1")
        .bind(hash),
    ]);
    return result[0].meta.changes === 1 && result[1].meta.changes === 1;
  } catch {
    return false;
  }
}

import { createHash, createHmac, randomUUID } from "node:crypto";

// Trusted harness only. This is synthetic source proof, not a Clerk exchange or email match.
// No Worker entry point imports this issuer, and no HTTP endpoint can mint a grant.
export async function issueFixtureGrant(db, secret, authUserId, legacyOwnerId, expiresAt = Date.now() + 60_000) {
  const nonce = randomUUID();
  const encoded = Buffer.from(JSON.stringify({ authUserId, legacyOwnerId, expiresAt, nonce })).toString("base64url");
  const token = `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
  await db.prepare("INSERT INTO claim_grants (tokenHash, authUserId, legacyOwnerId, expiresAt, nonce) VALUES (?, ?, ?, ?, ?)")
    .bind(createHash("sha256").update(token).digest("hex"), authUserId, legacyOwnerId, expiresAt, nonce).run();
  return token;
}

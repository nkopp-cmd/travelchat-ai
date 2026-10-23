"use client";

import { primeSession, SESSION_SEED_META } from "@/lib/auth/session-store";
import type { PublicSession } from "@/lib/auth/server";

/**
 * Hands the server-validated session of a dynamic, private (no-store) page to the client
 * session store before any hook subscribes, so useUser() needs no get-session request.
 * Never use it on static or edge-cached pages. The visibility refresh still catches revocation.
 */
export function SessionSeed({ session }: { session: PublicSession | null }) {
  if (!session) return null;
  primeSession(session);
  // Pages behind a loading boundary hydrate after the navbar subscribes, so the store also
  // reads this tag (React escapes the attribute) before its first get-session request.
  return <meta name={SESSION_SEED_META} content={JSON.stringify(session)} />;
}

"use client";

import { primeSession } from "@/lib/auth/session-store";
import type { PublicSession } from "@/lib/auth/server";

/**
 * Hands the server-validated session of a dynamic, private (no-store) page to the client
 * session store before any hook subscribes, so useUser() needs no get-session request.
 * Never use it on static or edge-cached pages. The visibility refresh still catches revocation.
 */
export function SessionSeed({ session }: { session: PublicSession | null }) {
  if (session) primeSession(session);
  return null;
}

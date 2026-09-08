import { createAuth } from "./auth";

export interface TrustedAppSession {
  authUserId: string;
  ownerId: string;
  userRecordId: string;
  sessionId: string;
}

export type AppSession =
  | { state: "signedout" }
  | { state: "unverified" }
  | { state: "unlinked" | "incomplete"; authUserId: string; sessionId: string }
  | ({ state: "ready" } & TrustedAppSession);

export async function trustedAppSession(env: Env, headers: Headers): Promise<AppSession> {
  const session = await createAuth(env).api.getSession({ headers });
  if (!session) return { state: "signedout" };
  // Read current verification and linkage, never a cookie snapshot or cached mapping.
  const row = await env.DB.prepare(`SELECT u.emailVerified, l.ownerId, p.id AS userRecordId
    FROM user u LEFT JOIN identity_links l ON l.authUserId = u.id
    LEFT JOIN profiles p ON p.ownerId = l.ownerId WHERE u.id = ?`)
    .bind(session.user.id).first<{ emailVerified: number; ownerId: string | null; userRecordId: string | null }>();
  if (!row) return { state: "signedout" };
  if (row.emailVerified !== 1) return { state: "unverified" };
  const identity = { authUserId: session.user.id, sessionId: session.session.id };
  if (!row.ownerId) return { state: "unlinked", ...identity };
  if (!row.userRecordId) return { state: "incomplete", ...identity };
  return { state: "ready", ...identity, ownerId: row.ownerId, userRecordId: row.userRecordId };
}

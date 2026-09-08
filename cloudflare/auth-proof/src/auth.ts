import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createAuth(env: Env) {
  let outboxFailed = false;
  const outbox = async (kind: string, userId: string, url: string, token: string) => {
    try {
      await env.DB.prepare("INSERT INTO local_outbox (kind, authUserId, url, token) VALUES (?, ?, ?, ?)")
        .bind(kind, userId, url, token).run();
    } catch {
      outboxFailed = true;
      throw new Error("Local outbox persistence failed");
    }
  };
  const auth = betterAuth({
    baseURL: env.AUTH_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB), { provider: "sqlite", schema, transaction: false }),
    logger: { disabled: true },
    // Route unknown errors to the Worker's safe response instead of better-call's console fallback.
    onAPIError: { throw: true },
    trustedOrigins: [env.AUTH_BASE_URL],
    emailAndPassword: {
      enabled: true, requireEmailVerification: true, autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => { await outbox("reset", user.id, url, token); },
    },
    emailVerification: {
      sendOnSignUp: true, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url, token }) => { await outbox("verify", user.id, url, token); },
    },
    account: { accountLinking: { enabled: false } },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: { secure: true, httpOnly: true, sameSite: "lax" },
      ipAddress: { ipAddressHeaders: ["x-local-proof-ip"] },
    },
  });
  return {
    ...auth,
    async handler(request: Request) {
      const response = await auth.handler(request);
      // Better Auth awaits but catches email callback failures. Do not report delivery success.
      if (outboxFailed) return Response.json({ error: "Local proof failure" }, { status: 500, headers: { "Cache-Control": "no-store" } });
      return response;
    },
  };
}

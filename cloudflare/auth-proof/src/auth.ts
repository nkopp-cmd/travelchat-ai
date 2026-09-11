import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { allowedEmail, isPreview, type RuntimeEnv } from "./runtime";
import { jwtVerify } from "jose";
import type { AccessIdentity } from "./access";
import { sendPreviewMail } from "./preview-mail";

export function createAuth(env: RuntimeEnv, identity?: AccessIdentity) {
  let outboxFailed = false;
  const outbox = async (kind: string, userId: string, url: string, token: string, email: string) => {
    try {
      if (isPreview(env)) return await sendPreviewMail(env, identity, kind, userId, email, url);
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
      sendResetPassword: async ({ user, url, token }) => { await outbox("reset", user.id, url, token, user.email); },
    },
    emailVerification: {
      sendOnSignUp: true, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url, token }) => { await outbox("verify", user.id, url, token, user.email); },
    },
    account: { accountLinking: { enabled: false } },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
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
      if (isPreview(env)) {
        const denied = () => Response.json({ error: "Auth action unavailable" }, { status: 403, headers: { "Cache-Control": "no-store" } });
        if (identity?.kind !== "human") return denied();
        const url = new URL(request.url);
        const route = url.pathname.slice("/api/auth/".length);
        const resetCallback = /^reset-password\/[^/]+$/.test(route);
        const reads = ["get-session", "verify-email"];
        const writes = ["sign-up/email", "sign-in/email", "sign-out", "request-password-reset", "reset-password", "send-verification-email", "change-password", "revoke-session", "revoke-sessions", "revoke-other-sessions"];
        if (!(request.method === "GET" ? reads.includes(route) || resetCallback : request.method === "POST" && writes.includes(route))) return denied();
        if (request.method === "POST" && request.headers.get("Origin") !== env.AUTH_BASE_URL) return denied();
        // The outer handler already bounds this body. SDK actions can send zero bytes.
        const body = request.method === "POST" ? await request.clone().text() : "";
        const data: Record<string, unknown> = body === "" ? {} : JSON.parse(body);
        if (request.method === "POST" && body === "") {
          // A zero-byte stream otherwise makes Better Call parse a nonexistent JSON body.
          const headers = new Headers(request.headers);
          headers.delete("Content-Length");
          request = new Request(request.url, { method: "POST", headers });
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) return denied();
        if (["sign-up/email", "sign-in/email", "request-password-reset", "send-verification-email"].includes(route)
          && allowedEmail(env, data.email) !== identity.email) return denied();
        const session = await auth.api.getSession({ headers: request.headers });
        if (session && allowedEmail(env, session.user.email) !== identity.email) return denied();
        if (route === "verify-email") {
          try {
            const token = url.searchParams.get("token");
            if (!token || token.length > 8192) return denied();
            const { payload } = await jwtVerify(token, new TextEncoder().encode(env.BETTER_AUTH_SECRET), { algorithms: ["HS256"], requiredClaims: ["exp"] });
            if (allowedEmail(env, payload.email) !== identity.email || payload.updateTo !== undefined || payload.requestType !== undefined) return denied();
          } catch { return denied(); }
        }
        if (route === "reset-password" || resetCallback) {
          const token = resetCallback ? decodeURIComponent(route.slice("reset-password/".length)) : data.token || url.searchParams.get("token");
          if (typeof token !== "string" || !token || token.length > 512) return denied();
          const context = await auth.$context;
          const verification = await context.internalAdapter.findVerificationValue(`reset-password:${token}`);
          if (!verification || verification.expiresAt.getTime() <= Date.now()) return denied();
          const user = await context.internalAdapter.findUserById(verification.value);
          if (allowedEmail(env, user?.email) !== identity.email) return denied();
        }
      }
      const response = await auth.handler(request);
      // Better Auth awaits but catches email callback failures. Do not report delivery success.
      if (outboxFailed) return Response.json({ error: "Local proof failure" }, { status: 500, headers: { "Cache-Control": "no-store" } });
      return response;
    },
  };
}

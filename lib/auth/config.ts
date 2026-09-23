/**
 * Better Auth factory for Localley (replaces Clerk, decided by Nils 2026-09-23).
 *
 * Pure: every input (database, secrets, mail sender, hooks) is passed in, so the
 * same factory runs on the Worker (D1 binding `AUTH_DB`), in unit tests and in the
 * migration rehearsal (node:sqlite). Server code must use `lib/auth/server.ts`.
 *
 * User ids: users migrated from Clerk keep their Clerk id (`user_...`), so the
 * Supabase columns `clerk_id` / `clerk_user_id` / `user_id` stay valid unchanged.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { magicLink } from "better-auth/plugins";

export type AuthMailKind = "verify-email" | "reset-password" | "magic-link";

export interface AuthMail {
  kind: AuthMailKind;
  to: string;
  url: string;
  name?: string | null;
}

export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface CreateAuthInput {
  /** D1Database binding, node:sqlite DatabaseSync, or any Better Auth database. */
  database: BetterAuthOptions["database"];
  secret: string;
  /** A fixed URL, or { allowedHosts, fallback } to serve several hosts (www, apex, staging). */
  baseURL: NonNullable<BetterAuthOptions["baseURL"]>;
  trustedOrigins: string[];
  sendMail: (mail: AuthMail) => Promise<void>;
  google?: { clientId: string; clientSecret: string } | null;
  onUserCreated?: (user: AuthUserRecord) => Promise<void>;
  onUserUpdated?: (user: AuthUserRecord) => Promise<void>;
  /** Tests only: plain-HTTP cookies. */
  insecureCookies?: boolean;
  rateLimit?: boolean;
}

export const AUTH_BASE_PATH = "/api/auth";

export function createAuth(input: CreateAuthInput) {
  const socialProviders: BetterAuthOptions["socialProviders"] = input.google
    ? { google: { clientId: input.google.clientId, clientSecret: input.google.clientSecret, prompt: "select_account" } }
    : undefined;

  const safely = (hook: ((user: AuthUserRecord) => Promise<void>) | undefined) =>
    async (user: AuthUserRecord) => {
      if (!hook) return;
      try {
        await hook(user);
      } catch (error) {
        // App-data sync must never block sign-up / profile edits.
        console.error("[auth] user hook failed:", error instanceof Error ? error.message : "unknown");
      }
    };
  const created = safely(input.onUserCreated);
  const updated = safely(input.onUserUpdated);

  return betterAuth({
    appName: "Localley",
    baseURL: input.baseURL,
    basePath: AUTH_BASE_PATH,
    secret: input.secret,
    database: input.database,
    trustedOrigins: input.trustedOrigins,
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await input.sendMail({ kind: "reset-password", to: user.email, url, name: user.name });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await input.sendMail({ kind: "verify-email", to: user.email, url, name: user.name });
      },
    },
    socialProviders,
    account: {
      // Migrated Clerk users have no account row yet. A verified Google login links
      // to the existing user (same id) by email instead of creating a new user.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    user: {
      additionalFields: {
        firstName: { type: "string", required: false, input: true },
        lastName: { type: "string", required: false, input: true },
        bio: { type: "string", required: false, input: true },
      },
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: input.rateLimit ?? true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
        "/sign-in/magic-link": { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: !input.insecureCookies,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    },
    databaseHooks: {
      user: {
        create: { after: async (user) => { await created(user as AuthUserRecord); } },
        update: { after: async (user) => { await updated(user as AuthUserRecord); } },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          await input.sendMail({ kind: "magic-link", to: email, url });
        },
      }),
    ],
  });
}

export type LocalleyAuth = ReturnType<typeof createAuth>;

import "server-only";

/**
 * Server-side auth adapter (Better Auth). Every server file imports auth from here,
 * never from better-auth directly and never from Clerk.
 *
 * - `auth()`        -> { userId, sessionId }  (drop-in for Clerk's auth())
 * - `currentUser()` -> Clerk-shaped user subset or null (drop-in for Clerk's currentUser())
 * - `getSession()`  -> Better Auth session or null
 * - `requireUser()` -> { userId } or a 401 NextResponse
 *
 * Storage: Cloudflare D1 binding AUTH_DB (docs/AUTH_BETTER_AUTH.md). In `next dev`
 * the binding comes from initOpenNextCloudflareForDev (local miniflare D1).
 */
import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { createAuth, type AuthUserRecord, type LocalleyAuth } from "./config";
import { createMailSender, type OutboxDatabase } from "./mail";
import { syncAppUserCreated, syncAppUserUpdated } from "./user-sync";

const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

type AuthDatabase = OutboxDatabase & object;

function runtimeBindings(): Record<string, unknown> | undefined {
  const context = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[cloudflareContextSymbol];
  return context?.env;
}

function authDatabase(): AuthDatabase {
  const db = runtimeBindings()?.AUTH_DB as AuthDatabase | undefined;
  if (!db || typeof db.prepare !== "function") {
    throw new Error("AUTH_DB binding is not configured");
  }
  return db;
}

const DEFAULT_HOSTS = ["www.localley.io", "localley.io"];

export function authHosts(): string[] {
  const configured = (process.env.AUTH_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_HOSTS;
}

function authFallbackURL(): string {
  return process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://localley.io";
}

function googleProvider() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function isGoogleSignInEnabled(): boolean {
  return googleProvider() !== null;
}

const instances = new WeakMap<object, LocalleyAuth>();

/** Better Auth instance bound to this request's D1 binding. */
export function getAuth(): LocalleyAuth {
  const db = authDatabase();
  const cached = instances.get(db);
  if (cached) return cached;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET is not configured");
  }
  const fallback = authFallbackURL();
  const local = fallback.startsWith("http://");
  const hosts = authHosts();
  const instance = createAuth({
    database: db as never,
    secret,
    baseURL: local ? fallback : { allowedHosts: hosts, fallback, protocol: "https" },
    trustedOrigins: local ? [fallback] : hosts.map((h) => `https://${h}`),
    sendMail: createMailSender(db),
    google: googleProvider(),
    onUserCreated: syncAppUserCreated,
    onUserUpdated: syncAppUserUpdated,
    insecureCookies: local,
  });
  instances.set(db, instance);
  return instance;
}

export type AuthSession = NonNullable<Awaited<ReturnType<LocalleyAuth["api"]["getSession"]>>>;

/** Current session, or null when signed out or when the auth store is unavailable. */
export async function getSession(requestHeaders?: Headers): Promise<AuthSession | null> {
  // Outside the try: headers() throws Next's dynamic-rendering signal during a static
  // build, which must propagate (same as Clerk's auth()) so the page renders per request.
  const hdrs = requestHeaders ?? (await nextHeaders());
  try {
    return (await getAuth().api.getSession({ headers: hdrs })) ?? null;
  } catch (error) {
    console.error("[auth] session lookup failed:", error instanceof Error ? error.message : "unknown");
    return null;
  }
}

export interface AuthState {
  userId: string | null;
  sessionId: string | null;
}

/** Drop-in replacement for Clerk's `auth()`. */
export async function auth(requestHeaders?: Headers): Promise<AuthState> {
  const session = await getSession(requestHeaders);
  return session
    ? { userId: session.user.id, sessionId: session.session.id }
    : { userId: null, sessionId: null };
}

/** Clerk-shaped subset used by existing call sites. */
export interface AppUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  username: string | null;
  imageUrl: string;
  createdAt: number;
  emailAddresses: Array<{ emailAddress: string }>;
  primaryEmailAddress: { emailAddress: string } | null;
  emailVerified: boolean;
  unsafeMetadata: { bio?: string };
}

type SessionUser = AuthSession["user"] & Partial<Pick<AuthUserRecord, "firstName" | "lastName">> & { bio?: string | null };

export function toAppUser(user: SessionUser): AppUser {
  const [first, ...rest] = (user.name || "").trim().split(/\s+/);
  const firstName = user.firstName ?? (first || null);
  const lastName = user.lastName ?? (rest.join(" ") || null);
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || user.name || null;
  const email = { emailAddress: user.email };
  return {
    id: user.id,
    firstName,
    lastName,
    fullName,
    username: null,
    imageUrl: user.image || "",
    createdAt: new Date(user.createdAt).getTime(),
    emailAddresses: [email],
    primaryEmailAddress: email,
    emailVerified: Boolean(user.emailVerified),
    unsafeMetadata: user.bio ? { bio: user.bio } : {},
  };
}

/** Drop-in replacement for Clerk's `currentUser()`. */
export async function currentUser(requestHeaders?: Headers): Promise<AppUser | null> {
  const session = await getSession(requestHeaders);
  return session ? toAppUser(session.user as SessionUser) : null;
}

/** Route-handler guard: `const gate = await requireUser(); if (gate.response) return gate.response;` */
export async function requireUser(
  requestHeaders?: Headers,
): Promise<{ userId: string; response: null } | { userId: null; response: NextResponse }> {
  const { userId } = await auth(requestHeaders);
  if (!userId) {
    return { userId: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId, response: null };
}

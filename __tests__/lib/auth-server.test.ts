// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthTestDatabase, type D1Sqlite } from "../helpers/d1-sqlite";

const state = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
const sync = vi.hoisted(() => ({ created: vi.fn(async () => {}), updated: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/user-sync", () => ({ syncAppUserCreated: sync.created, syncAppUserUpdated: sync.updated }));

import { auth, currentUser, getAuth, getSession, requireUser, toAppUser } from "@/lib/auth/server";
// @ts-expect-error plain ESM script without types
import { toInsertSql } from "@/scripts/auth/clerk-to-better-auth.mjs";

const BASE = "http://localhost:3000";
const symbol = Symbol.for("__cloudflare-context__");
const g = globalThis as unknown as Record<symbol, unknown>;
let db: D1Sqlite;
let ip = 0;

function setDatabase(next: D1Sqlite | undefined) {
  g[symbol] = next ? { env: { AUTH_DB: next } } : undefined;
}

function cookiesFrom(response: Response): string {
  return response.headers.getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

async function call(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers = new Headers({ origin: BASE, "x-forwarded-for": `10.0.0.${++ip}` });
  if (init.body) headers.set("content-type", "application/json");
  if (init.cookie) headers.set("cookie", init.cookie);
  return getAuth().handler(new Request(`${BASE}/api/auth${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  }));
}

function outbox(email: string) {
  return db.sqlite.prepare('select kind, url from auth_mail_outbox where email = ? order by id desc').all(email) as Array<{ kind: string; url: string }>;
}

function withCookie(cookie: string) {
  return new Headers({ cookie });
}

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "unit-test-secret-9f8e7d6c5b4a3210fedcba98";
  process.env.BETTER_AUTH_URL = BASE;
  process.env.AUTH_MAIL_MODE = "outbox";
  db = createAuthTestDatabase();
  setDatabase(db);
  state.headers = new Headers();
  sync.created.mockClear();
});

afterAll(() => {
  setDatabase(undefined);
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.BETTER_AUTH_URL;
  delete process.env.AUTH_MAIL_MODE;
});

describe("server auth adapter", () => {
  it("returns a signed-out state and a 401 guard without a session", async () => {
    expect(await auth()).toEqual({ userId: null, sessionId: null });
    expect(await currentUser()).toBeNull();
    const gate = await requireUser();
    expect(gate.userId).toBeNull();
    expect(gate.response?.status).toBe(401);
    expect(await gate.response?.json()).toEqual({ error: "Unauthorized" });
  });

  it("fails closed when the AUTH_DB binding is missing", async () => {
    setDatabase(undefined);
    expect(await getSession(withCookie("better-auth.session_token=x.y"))).toBeNull();
    expect((await requireUser()).response?.status).toBe(401);
  });

  it("signs up, verifies email, reads the session, and signs out", async () => {
    const email = "new.user@preview.localley.test";
    const signUp = await call("/sign-up/email", { body: { email, password: "correct-horse-1", name: "Ada Lovelace", firstName: "Ada", lastName: "Lovelace" } });
    expect(signUp.status).toBe(200);
    expect(cookiesFrom(signUp)).toBe(""); // no session before the email is confirmed
    expect(sync.created).toHaveBeenCalledTimes(1);

    const blocked = await call("/sign-in/email", { body: { email, password: "correct-horse-1" } });
    expect(blocked.status).toBe(403);

    const verify = outbox(email).find((m) => m.kind === "verify-email");
    expect(verify).toBeTruthy();
    const verified = await getAuth().handler(new Request(verify!.url, { redirect: "manual" }));
    expect([200, 302]).toContain(verified.status);
    const cookie = cookiesFrom(verified);
    expect(cookie).toContain("better-auth.session_token=");

    const state1 = await auth(withCookie(cookie));
    expect(state1.userId).toMatch(/.+/);
    const user = await currentUser(withCookie(cookie));
    expect(user).toMatchObject({ id: state1.userId, firstName: "Ada", lastName: "Lovelace", fullName: "Ada Lovelace", emailVerified: true });
    expect(user?.primaryEmailAddress?.emailAddress).toBe(email);
    expect((await requireUser(withCookie(cookie))).userId).toBe(state1.userId);

    const out = await call("/sign-out", { method: "POST", body: {}, cookie });
    expect(out.status).toBe(200);
    // The browser drops both cookies (sign-out expires them) ...
    expect(out.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token=;"))).toBe(true);
    // ... and the session row is gone, so the bare token no longer works either.
    const tokenOnly = cookie.split("; ").filter((c) => c.startsWith("better-auth.session_token=")).join("; ");
    expect((await auth(withCookie(tokenOnly))).userId).toBeNull();
  });

  it("blocks the pre-registration takeover: magic link removes an unproven password", async () => {
    const email = "victim@preview.localley.test";
    // Attacker registers the victim's address with a password and never verifies it.
    expect((await call("/sign-up/email", { body: { email, password: "attacker-pass-1", name: "Mallory" } })).status).toBe(200);
    // The real owner signs in with a magic link (proves the inbox).
    await call("/sign-in/magic-link", { body: { email, callbackURL: "/dashboard" } });
    const link = outbox(email).find((m) => m.kind === "magic-link")!;
    const landed = await getAuth().handler(new Request(link.url, { redirect: "manual" }));
    expect((await auth(withCookie(cookiesFrom(landed)))).userId).toMatch(/.+/);
    // The attacker's password no longer works.
    expect((await call("/sign-in/email", { body: { email, password: "attacker-pass-1" } })).status).toBe(401);
    expect(db.sqlite.prepare("select count(*) n from account where providerId = 'credential'").get()).toEqual(expect.objectContaining({ n: 0 }));
  });

  it("rejects a forged session cookie", async () => {
    expect((await auth(withCookie("better-auth.session_token=forged.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="))).userId).toBeNull();
  });
});

describe("migrated Clerk users keep their id", () => {
  const migrated = {
    id: "user_38VRtestMigrated01", email: "migrated@preview.localley.test", emailVerified: true,
    name: "Mig Rated", firstName: "Mig", lastName: "Rated", image: null, bio: null,
    createdAt: "2026-01-20T10:00:00.000Z", updatedAt: "2026-07-24T10:00:00.000Z",
  };

  beforeEach(() => { db.sqlite.exec(toInsertSql([migrated])); });

  it("signs in with a magic link as the old Clerk id", async () => {
    const send = await call("/sign-in/magic-link", { body: { email: migrated.email, callbackURL: "/dashboard" } });
    expect(send.status).toBe(200);
    const link = outbox(migrated.email).find((m) => m.kind === "magic-link")!;
    const landed = await getAuth().handler(new Request(link.url, { redirect: "manual" }));
    const cookie = cookiesFrom(landed);
    expect((await auth(withCookie(cookie))).userId).toBe(migrated.id);
    const user = await currentUser(withCookie(cookie));
    expect(user?.createdAt).toBe(Date.parse(migrated.createdAt));
    expect(sync.created).not.toHaveBeenCalled(); // existing user, no new app row
  });

  it("sets a first password through forgot-password and signs in as the old id", async () => {
    const noPassword = await call("/sign-in/email", { body: { email: migrated.email, password: "anything-123" } });
    expect(noPassword.status).toBe(401);
    await call("/request-password-reset", { body: { email: migrated.email, redirectTo: "/reset-password" } });
    const link = outbox(migrated.email).find((m) => m.kind === "reset-password")!;
    const token = new URL(link.url).pathname.split("/").pop()!;
    const reset = await call("/reset-password", { body: { token, newPassword: "brand-new-pass-1" } });
    expect(reset.status).toBe(200);
    const signIn = await call("/sign-in/email", { body: { email: migrated.email, password: "brand-new-pass-1" } });
    expect(signIn.status).toBe(200);
    expect((await auth(withCookie(cookiesFrom(signIn)))).userId).toBe(migrated.id);
  });

  it("is idempotent on id and refuses an email already taken by another user", async () => {
    expect(() => db.sqlite.exec(toInsertSql([migrated]))).not.toThrow();
    expect(() => db.sqlite.exec(toInsertSql([{ ...migrated, id: "user_other" }]))).toThrow(/UNIQUE/);
  });
});

describe("toAppUser", () => {
  it("maps a Better Auth user to the Clerk-shaped subset", () => {
    const user = toAppUser({
      id: "u1", name: "Solo", email: "s@x.test", emailVerified: true, image: null,
      createdAt: new Date("2026-02-01T00:00:00Z"), updatedAt: new Date(), bio: "Hi",
    } as never);
    expect(user).toMatchObject({ id: "u1", firstName: "Solo", lastName: null, imageUrl: "", username: null, unsafeMetadata: { bio: "Hi" } });
    expect(user.emailAddresses[0].emailAddress).toBe("s@x.test");
  });
});

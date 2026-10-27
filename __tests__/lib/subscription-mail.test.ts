// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthTestDatabase } from "../helpers/d1-sqlite";
import { sendSubscriptionMail, subscriptionMailEvent } from "@/lib/subscription-mail";

const context = Symbol.for("__cloudflare-context__");
let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const db = createAuthTestDatabase();
  const insert = db.sqlite.prepare(`INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`);
  insert.run("verified-1", "Mina", "mina@example.com", 1, 1, 1);
  insert.run("unverified-1", "Jo", "jo@example.com", 0, 1, 1);
  send = vi.fn(async () => ({ messageId: "msg-1" }));
  (globalThis as Record<symbol, unknown>)[context] = { env: { AUTH_DB: db, AUTH_EMAIL: { send } } };
  vi.stubEnv("AUTH_MAIL_MODE", "");
  vi.stubEnv("FROM_EMAIL", "Localley <hello@localley.io>");
});
afterEach(() => { delete (globalThis as Record<symbol, unknown>)[context]; vi.unstubAllEnvs(); });

describe("subscription confirmation mail", () => {
  it("sends the upgrade confirmation to the verified account email from hello@localley.io", async () => {
    expect(await sendSubscriptionMail("verified-1", "upgrade", "premium")).toEqual({ sent: true, emailId: "msg-1" });
    const message = send.mock.calls[0][0];
    expect(message).toMatchObject({ to: "mina@example.com", from: { email: "hello@localley.io" }, subject: "Your Localley Premium plan is active" });
    expect(message.html).toContain("https://localley.io/settings");
    expect(message.html).toContain("https://localley.io/dashboard");
    expect(message.text.length).toBeGreaterThan(20);
  });

  it("never mails an unverified or unknown account, and preview stays silent", async () => {
    expect(await sendSubscriptionMail("unverified-1", "cancelled")).toEqual({ sent: false, reason: "no_verified_email" });
    expect(await sendSubscriptionMail("nobody", "cancelled")).toEqual({ sent: false, reason: "no_verified_email" });
    vi.stubEnv("AUTH_MAIL_MODE", "outbox");
    expect(await sendSubscriptionMail("verified-1", "upgrade", "pro")).toEqual({ sent: false, reason: "preview_outbox" });
    expect(send).not.toHaveBeenCalled();
  });

  it("is due only on the state change", () => {
    expect(subscriptionMailEvent(null, { tier: "pro", status: "active" })).toBe("upgrade");
    expect(subscriptionMailEvent({ tier: "free", status: "canceled" }, { tier: "pro", status: "trialing" })).toBe("upgrade");
    expect(subscriptionMailEvent({ tier: "pro", status: "trialing" }, { tier: "pro", status: "active" })).toBeNull();
    expect(subscriptionMailEvent({ tier: "pro", status: "active" }, { tier: "premium", status: "active" })).toBe("upgrade");
    expect(subscriptionMailEvent({ tier: "pro", status: "active" }, { tier: "pro", status: "past_due" })).toBeNull();
    expect(subscriptionMailEvent({ tier: "pro", status: "active" }, { tier: "free", status: "canceled" })).toBe("cancelled");
    expect(subscriptionMailEvent({ tier: "free", status: "canceled" }, { tier: "free", status: "canceled" })).toBeNull();
    expect(subscriptionMailEvent(null, { tier: "free", status: "canceled" })).toBeNull();
  });
});

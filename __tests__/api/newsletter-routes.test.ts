// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "../helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ limit: vi.fn(), devLimit: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ strictPlatformLimit: mocks.limit, rateLimit: () => mocks.devLimit }));
vi.mock("@/lib/newsletter/mail", () => ({ sendNewsletterConfirm: mocks.send }));

import { POST as subscribePost } from "@/app/api/newsletter/subscribe/route";
import { POST as confirmPost } from "@/app/api/newsletter/confirm/route";
import { POST as unsubscribePost } from "@/app/api/newsletter/unsubscribe/route";

const MIGRATION = readFileSync(path.resolve(__dirname, "../../migrations/app-preview/0051_newsletter_subscribers.sql"), "utf8");
const CONTEXT = Symbol.for("__cloudflare-context__");
const ORIGIN = "https://www.localley.io";
let db: D1Sqlite;

const form = (url: string, fields: Record<string, string>) =>
  new NextRequest(url, { method: "POST", body: new URLSearchParams(fields), headers: { "content-type": "application/x-www-form-urlencoded" } });
const signup = (fields: Record<string, string>) => subscribePost(form(`${ORIGIN}/api/newsletter/subscribe`, fields));
const where = (res: Response) => new URL(res.headers.get("location") ?? "").pathname;
const row = (email: string) => db.sqlite.prepare("SELECT * FROM newsletter_subscribers WHERE email = ?").get(email) as Record<string, unknown> | undefined;

beforeEach(() => {
  db = new D1Sqlite();
  db.sqlite.exec(MIGRATION);
  (globalThis as Record<symbol, unknown>)[CONTEXT] = { env: { APP_DB: db } };
  mocks.limit.mockReset().mockResolvedValue("ok");
  mocks.devLimit.mockReset().mockResolvedValue(null);
  mocks.send.mockReset().mockResolvedValue({ sent: true });
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as Record<symbol, unknown>)[CONTEXT];
  db.sqlite.close();
});

describe("POST /api/newsletter/subscribe", () => {
  it("stores a pending row, mails the link and answers thanks", async () => {
    const res = await signup({ email: "T@Example.com", source: "city-hub", city: "seoul", website: "" });
    expect(res.status).toBe(303);
    expect(where(res)).toBe("/newsletter/thanks");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(row("t@example.com")).toMatchObject({ status: "pending", source: "city-hub", city: "seoul" });
    expect(mocks.send).toHaveBeenCalledWith("t@example.com", expect.stringMatching(/^[0-9a-f]{64}$/));
    expect(mocks.limit).toHaveBeenCalledWith(expect.anything(), 5, "newsletter_subscribe");
  });

  it("gives the same answer to a repeat, without a second mail", async () => {
    await signup({ email: "t@example.com" });
    const res = await signup({ email: "t@example.com" });
    expect(where(res)).toBe("/newsletter/thanks");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("drops honeypot posts silently", async () => {
    const res = await signup({ email: "bot@example.com", website: "http://spam.example" });
    expect(where(res)).toBe("/newsletter/thanks");
    expect(row("bot@example.com")).toBeUndefined();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("fails closed when the platform limit says limited or unavailable", async () => {
    for (const verdict of ["limited", "unavailable"]) {
      mocks.limit.mockResolvedValueOnce(verdict);
      const res = await signup({ email: "t@example.com" });
      expect(where(res)).toBe("/newsletter/retry");
    }
    expect(row("t@example.com")).toBeUndefined();
  });

  it("uses the in-memory limiter outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.devLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect(where(await signup({ email: "t@example.com" }))).toBe("/newsletter/retry");
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it("asks again for a bad address", async () => {
    expect(where(await signup({ email: "not-an-address" }))).toBe("/newsletter/check-email");
  });

  it("releases the link when the mail fails, so a retry can send", async () => {
    mocks.send.mockRejectedValueOnce(new Error("mail down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(where(await signup({ email: "t@example.com" }))).toBe("/newsletter/retry");
    expect(row("t@example.com")?.confirm_expires).toBe(0);
    expect(where(await signup({ email: "t@example.com" }))).toBe("/newsletter/thanks");
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("answers retry without a database", async () => {
    (globalThis as Record<symbol, unknown>)[CONTEXT] = { env: {} };
    expect(where(await signup({ email: "t@example.com" }))).toBe("/newsletter/retry");
  });
});

describe("confirm and unsubscribe routes", () => {
  async function pendingToken() {
    await signup({ email: "t@example.com" });
    return mocks.send.mock.calls[0][1] as string;
  }

  it("confirms with a POSTed token, once", async () => {
    const token = await pendingToken();
    const ok = await confirmPost(form(`${ORIGIN}/api/newsletter/confirm`, { token }));
    expect([ok.status, where(ok)]).toEqual([303, "/newsletter/confirmed"]);
    expect(row("t@example.com")?.status).toBe("confirmed");
    expect(where(await confirmPost(form(`${ORIGIN}/api/newsletter/confirm`, { token })))).toBe("/newsletter/invalid");
  });

  it("supports RFC 8058 one-click with the token in the URL", async () => {
    await pendingToken();
    const token = String(row("t@example.com")?.unsubscribe_token);
    const res = await unsubscribePost(form(`${ORIGIN}/api/newsletter/unsubscribe?token=${token}`, { "List-Unsubscribe": "One-Click" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Unsubscribed.");
    expect(row("t@example.com")?.status).toBe("unsubscribed");
    const unknown = await unsubscribePost(form(`${ORIGIN}/api/newsletter/unsubscribe?token=${"d".repeat(64)}`, { "List-Unsubscribe": "One-Click" }));
    expect(unknown.status).toBe(404);
  });

  it("redirects the page button to the state pages", async () => {
    await pendingToken();
    const token = String(row("t@example.com")?.unsubscribe_token);
    expect(where(await unsubscribePost(form(`${ORIGIN}/api/newsletter/unsubscribe`, { token })))).toBe("/newsletter/unsubscribed");
    expect(where(await unsubscribePost(form(`${ORIGIN}/api/newsletter/unsubscribe`, { token: "bad" })))).toBe("/newsletter/invalid");
  });
});

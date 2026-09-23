// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/test-auth/outbox/route";
import { createAuthTestDatabase } from "../helpers/d1-sqlite";

const symbol = Symbol.for("__cloudflare-context__");
const g = globalThis as unknown as Record<symbol, unknown>;
const req = (email: string) => new NextRequest(`https://preview.test/api/test-auth/outbox?email=${encodeURIComponent(email)}`);

afterEach(() => { delete process.env.AUTH_MAIL_MODE; delete process.env.BETTER_AUTH_URL; g[symbol] = undefined; });

describe("/api/test-auth/outbox", () => {
  it("does not exist outside outbox mode (production)", async () => {
    expect((await GET(req("a@preview.localley.test"))).status).toBe(404);
  });

  it("stays closed on production hosts even if AUTH_MAIL_MODE=outbox leaks there", async () => {
    process.env.AUTH_MAIL_MODE = "outbox";
    g[symbol] = { env: { AUTH_DB: createAuthTestDatabase() } };
    const onProdHost = new NextRequest("https://www.localley.io/api/test-auth/outbox?email=a%40preview.localley.test");
    expect((await GET(onProdHost)).status).toBe(404);
    process.env.BETTER_AUTH_URL = "https://next.localley.io";
    expect((await GET(req("a@preview.localley.test"))).status).toBe(404);
  });

  it("only serves the reserved test domain", async () => {
    process.env.AUTH_MAIL_MODE = "outbox";
    g[symbol] = { env: { AUTH_DB: createAuthTestDatabase() } };
    expect((await GET(req("someone@gmail.com"))).status).toBe(400);
  });

  it("returns the newest links for a test address", async () => {
    process.env.AUTH_MAIL_MODE = "outbox";
    const db = createAuthTestDatabase();
    g[symbol] = { env: { AUTH_DB: db } };
    const insert = db.sqlite.prepare("insert into auth_mail_outbox (kind, email, url, createdAt) values (?, ?, ?, ?)");
    insert.run("verify-email", "bot@preview.localley.test", "https://x/verify", 1);
    insert.run("magic-link", "bot@preview.localley.test", "https://x/magic", 2);
    insert.run("magic-link", "other@preview.localley.test", "https://x/other", 3);
    const response = await GET(req("BOT@preview.localley.test"));
    expect(response.status).toBe(200);
    expect((await response.json()).messages.map((m: { url: string }) => m.url)).toEqual(["https://x/magic", "https://x/verify"]);
  });
});

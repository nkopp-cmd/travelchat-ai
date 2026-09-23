import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import middleware from "@/middleware";

const SECRET = "test-secret-for-middleware-0123456789abcdef";

async function signedCookie(token: string, secret = SECRET) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
  return encodeURIComponent(`${token}.${btoa(String.fromCharCode(...sig))}`);
}

function request(path: string, init: { method?: string; cookie?: string } = {}) {
  return new NextRequest(`https://www.localley.io${path}`, {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: init.cookie } : {},
  });
}

beforeEach(() => { process.env.BETTER_AUTH_SECRET = SECRET; });
afterEach(() => { delete process.env.BETTER_AUTH_SECRET; });

describe("local sign-in continuation", () => {
  it.each(["/dashboard?tab=saved", "/settings", "/itineraries/trip-1", "/dashboard?redirect_url=https%3A%2F%2Fexample.invalid"])("keeps %s on the app origin", async path => {
    const response = await middleware(request(path));
    expect(response.status).toBe(307);
    const destination = new URL(response.headers.get("location")!);
    expect(destination.origin).toBe("https://www.localley.io");
    expect(destination.pathname).toBe("/sign-in");
    expect(destination.searchParams.get("redirect_url")).toBe(path);
    expect(new URL(destination.searchParams.get("redirect_url")!, destination.origin).origin).toBe(destination.origin);
  });

  it.each(["/api/spots/save", "/api/spots/spot-1/reviews", "/trpc/private", "/api/v2/trips/preview"])("returns 401 for signed-out POST %s", async path => {
    const response = await middleware(request(path, { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it.each(["/spots", "/sign-in", "/sign-in/factor-one", "/api/spots/spot-1/reviews", "/api/auth/get-session", "/forgot-password", "/reset-password", "/itineraries/abc/stories"])("does not protect public GET %s", async path => {
    const response = await middleware(request(path));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a correctly signed session cookie through", async () => {
    const cookie = `__Secure-better-auth.session_token=${await signedCookie("session-token-abc")}`;
    const response = await middleware(request("/dashboard", { cookie }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    const api = await middleware(request("/api/spots/save", { method: "POST", cookie }));
    expect(api.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    ["forged signature", async () => `__Secure-better-auth.session_token=${await signedCookie("session-token-abc", "another-secret-0123456789abcdefghij")}`],
    ["unsigned token", async () => "__Secure-better-auth.session_token=session-token-abc"],
    ["garbage", async () => "better-auth.session_token=%E0%A4%A"],
  ])("rejects a %s", async (_label, make) => {
    const response = await middleware(request("/api/spots/save", { method: "POST", cookie: await make() }));
    expect(response.status).toBe(401);
  });

  it("fails closed without BETTER_AUTH_SECRET", async () => {
    const cookie = `__Secure-better-auth.session_token=${await signedCookie("session-token-abc")}`;
    delete process.env.BETTER_AUTH_SECRET;
    const response = await middleware(request("/dashboard", { cookie }));
    expect(response.status).toBe(307);
  });
});

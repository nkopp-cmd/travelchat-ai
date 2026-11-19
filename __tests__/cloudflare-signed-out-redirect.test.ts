import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import middleware, { isPrivateSection, isPublicRoute } from "@/middleware";
import { FAST_REDIRECT_PATHS, signedOutRedirect } from "../cloudflare/opennext/signed-out-redirect";

// Push AW2: the Worker-entry 307 must equal the middleware 307 for every fast path, so the fast path changes only time.
const HINT = "ll_account=1";
const SESSION = "__Secure-better-auth.session_token=abc.def";
const edge = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  signedOutRedirect(new Request(`https://www.localley.io${path}`, {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: init.cookie } : {},
  }));
const viaMiddleware = async (path: string, cookie?: string) => {
  const response = await middleware(new NextRequest(`https://www.localley.io${path}`, cookie ? { headers: { cookie } } : {}));
  const location = new URL(response.headers.get("location") ?? "", "https://www.localley.io");
  return { status: response.status, location: location.pathname + location.search };
};

describe("signed-out fast redirect (Push AW2)", () => {
  for (const path of FAST_REDIRECT_PATHS) {
    it(`${path} is a private page, not public`, () => {
      expect(isPrivateSection(path)).toBe(true);
      expect(isPublicRoute(new NextRequest(`https://www.localley.io${path}`))).toBe(false);
    });
    for (const [label, search, cookie] of [["new visitor", "", undefined], ["returning visitor", "?tab=trips&x=a b", HINT]] as const) {
      it(`${path}${search} (${label}) equals the middleware answer`, async () => {
        const fast = edge(path + search, { cookie });
        expect(fast?.status).toBe(307);
        expect(fast?.headers.get("x-localley-edge-redirect")).toBe("1");
        expect(fast?.headers.get("strict-transport-security")).toBe("max-age=31536000");
        expect({ status: fast?.status, location: fast?.headers.get("location") }).toEqual(await viaMiddleware(path + search, cookie));
      });
    }
  }

  it("HEAD gets the same redirect", () => {
    expect(edge("/settings", { method: "HEAD" })?.headers.get("location")).toBe("/sign-up?redirect_url=%2Fsettings");
  });

  it("leaves every other request to the full app", () => {
    expect(edge("/settings", { cookie: SESSION })).toBeNull();
    expect(edge("/settings", { cookie: `${HINT}; better-auth.session_token=x` })).toBeNull();
    expect(edge("/settings", { method: "POST" })).toBeNull();
    expect(edge("/settings?error=TOKEN_EXPIRED")).toBeNull();
    expect(edge("/settings/")).toBeNull();
    expect(edge("/itineraries/new")).toBeNull();
    expect(edge("/spots")).toBeNull();
    expect(edge("/pricing")).toBeNull();
    expect(edge("/")).toBeNull();
    expect(signedOutRedirect(new Request("https://localley.io/settings"))).toBeNull();
  });

  it("a cookie whose name only contains the session name does not count as a session", () => {
    expect(edge("/settings", { cookie: "x-better-auth.session_token=1" })?.status).toBe(307);
  });
});

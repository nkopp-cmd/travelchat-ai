// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { REFERRAL_BEACON_SCRIPT, REFERRAL_URL, referralPoint } from "@/lib/referral-point";
import { POST } from "@/app/api/events/referral/route";
import { isPublicRoute } from "@/middleware";

vi.mock("server-only", () => ({}));

const CONTEXT = Symbol.for("__cloudflare-context__");
const globals = globalThis as unknown as Record<symbol, unknown>;

function runBeacon(search: string, referrer: string, stored: Record<string, string> = {}) {
  const sent: { url: string; body: unknown }[] = [];
  const sessionStorage = { getItem: (k: string) => stored[k] ?? null, setItem: (k: string, v: string) => { stored[k] = v; } };
  const navigator = { sendBeacon: (url: string, body: string) => { sent.push({ url, body: JSON.parse(body) }); return true; } };
  const location = { search, pathname: "/help/korea" };
  new Function("location", "document", "sessionStorage", "navigator", REFERRAL_BEACON_SCRIPT)(
    location, { referrer }, sessionStorage, navigator);
  return sent;
}

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new NextRequest("https://www.localley.io/api/events/referral", { method: "POST", body, headers }));

describe("referral point", () => {
  it("keeps UTM fields and an outside referrer host, cleaned and bounded", () => {
    expect(referralPoint({ s: "ProductHunt", m: "launch", c: "Nov 2026!", r: "www.producthunt.com", p: "/help/korea?x=<b>" }))
      .toEqual({ blobs: ["producthunt", "launch", "nov2026", "www.producthunt.com", "/help/koreaxb"], indexes: ["producthunt"] });
  });

  it("drops own hosts and empty bodies", () => {
    expect(referralPoint({ r: "www.localley.io", p: "/" })).toBeNull();
    expect(referralPoint({ r: "localley.app" })).toBeNull();
    expect(referralPoint({})).toBeNull();
    expect(referralPoint("nope")).toBeNull();
  });

  it("uses the referrer host as index when there is no utm_source", () => {
    expect(referralPoint({ r: "news.ycombinator.com", p: "/" })?.indexes).toEqual(["news.ycombinator.com"]);
  });
});

describe("landing beacon script", () => {
  it("sends one beacon for a UTM landing and none again in the same session", () => {
    const stored: Record<string, string> = {};
    const first = runBeacon("?utm_source=reddit&utm_medium=post&utm_campaign=launch", "", stored);
    expect(first).toEqual([{ url: REFERRAL_URL, body: { s: "reddit", m: "post", c: "launch", r: "", p: "/help/korea" } }]);
    expect(runBeacon("?utm_source=reddit", "", stored)).toEqual([]);
  });

  it("sends for an outside referrer and stays silent for internal navigation", () => {
    expect(runBeacon("", "https://www.google.com/")[0]?.body).toMatchObject({ s: null, r: "www.google.com" });
    expect(runBeacon("", "https://www.localley.io/spots")).toEqual([]);
    expect(runBeacon("", "")).toEqual([]);
  });
});

describe("referral collector route", () => {
  afterEach(() => { delete globals[CONTEXT]; });

  it("is public in middleware and writes one data point", async () => {
    expect(isPublicRoute(new NextRequest("https://www.localley.io/api/events/referral", { method: "POST" }))).toBe(true);
    const writeDataPoint = vi.fn();
    globals[CONTEXT] = { env: { REFERRALS: { writeDataPoint } } };
    const response = await post(JSON.stringify({ s: "reddit", r: "", p: "/" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("X-Localley-Referral")).toBe("written");
    expect(writeDataPoint).toHaveBeenCalledWith({ blobs: ["reddit", "", "", "", "/"], indexes: ["reddit"] });
  });

  it("refuses other origins, junk and oversized bodies without writing", async () => {
    const writeDataPoint = vi.fn();
    globals[CONTEXT] = { env: { REFERRALS: { writeDataPoint } } };
    expect((await post(JSON.stringify({ s: "x" }), { origin: "https://evil.test" })).status).toBe(403);
    expect((await post("{")).status).toBe(400);
    expect((await post(JSON.stringify({ r: "www.localley.io" }))).status).toBe(400);
    expect((await post("x".repeat(2000))).status).toBe(413);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });

  it("skips the write when the rate limit says limited", async () => {
    const writeDataPoint = vi.fn();
    globals[CONTEXT] = { env: { REFERRALS: { writeDataPoint }, RATE_LIMIT_5: { limit: async () => ({ success: false }) } } };
    const response = await post(JSON.stringify({ s: "reddit" }), { "cf-connecting-ip": "203.0.113.9" });
    expect(response.status).toBe(204);
    expect(response.headers.get("X-Localley-Referral")).toBe("skipped");
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});

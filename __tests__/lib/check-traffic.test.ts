// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createAuthTestDatabase } from "../helpers/d1-sqlite";
import { isCheckTraffic } from "@/lib/check-traffic";

const CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const CUBOT = "Mozilla/5.0 (Linux; Android 12; CUBOT KINGKONG 9 Build/SP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

describe("own checks are not visitors (Push AE4)", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("flags the check header and check/headless agents", () => {
    expect(isCheckTraffic(h({ "x-localley-check": "1", "user-agent": CHROME }))).toBe(true);
    for (const agent of [
      "curl/8.5.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
      "python-requests/2.32.3",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    ]) expect(isCheckTraffic(h({ "user-agent": agent })), agent).toBe(true);
  });

  it("keeps real phone and desktop browsers", () => {
    for (const agent of [CHROME, SAFARI, CUBOT]) expect(isCheckTraffic(h({ "user-agent": agent })), agent).toBe(false);
  });

  it("collector answers 204 for a check beacon but stores nothing", async () => {
    const key = Symbol.for("__cloudflare-context__");
    const scope = globalThis as unknown as Record<symbol, unknown>;
    const before = scope[key];
    const db = createAuthTestDatabase();
    scope[key] = { env: { AUTH_DB: db }, ctx: {}, cf: {} };
    try {
      const { POST } = await import("@/app/api/events/spots/route");
      const send = (agent: string, extra: Record<string, string> = {}) => POST(new NextRequest("https://www.localley.io/api/events/spots", {
        method: "POST", body: JSON.stringify({ funnel: [{ step: "trip_generated", source: "direct" }] }),
        headers: { origin: "https://www.localley.io", "content-type": "application/json", "user-agent": agent, ...extra },
      }));
      const check = await send(CHROME, { "x-localley-check": "1" });
      expect(check.status).toBe(204);
      expect(check.headers.get("X-Localley-Events")).toBe("skipped");
      expect((await send("curl/8.5.0")).headers.get("X-Localley-Events")).toBe("skipped");
      expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM funnel_events_daily").get()).toEqual({ n: 0 });
      const human = await send(CHROME);
      expect(human.headers.get("X-Localley-Events")).toBe("stored");
      expect(db.sqlite.prepare("SELECT step, source, count FROM funnel_events_daily").all()).toEqual([{ step: "trip_generated", source: "direct", count: 1 }]);
    } finally {
      scope[key] = before;
    }
  });
});

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

  // Push AV4: social and messenger in-app browsers are where shared trips and ads open. A filter that
  // matched them would drop the real sign-up/payer funnel to zero without any error.
  it("keeps in-app browsers of the apps that send our visitors", () => {
    for (const agent of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1; ko_KR; ko; scale=3.00; 1179x2556; 659412311)",
      "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 Instagram 357.0.0.48.86 Android (34/14; 450dpi; 1080x2340; samsung; SM-S918N; dm3q; qcom; ko_KR; 659412340)",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/489.0.0.40.108;FBBV/659000000;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0",
      "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36;KAKAOTALK 2410900",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.18.0",
      "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_37.4.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/ko Region/KR",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.10.3)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
      "",
    ]) expect(isCheckTraffic(h({ "user-agent": agent })), agent).toBe(false);
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

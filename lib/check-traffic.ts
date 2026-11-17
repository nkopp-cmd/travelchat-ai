// Push AE4: our own live checks (curl, Lighthouse, PageSpeed, headless Playwright) must not count as
// visitors in the money funnel. Browsers already skip beacons when navigator.webdriver is set
// (lib/spot-analytics.ts analyticsOff); this server-side rule also covers headless runs without that flag.
// A scripted check marks itself with `X-Localley-Check: 1`.
export const CHECK_HEADER = "x-localley-check";

const CHECK_AGENT = /HeadlessChrome|Chrome-Lighthouse|Lighthouse|PageSpeed|PTST|curl\/|Wget|python-requests|python-urllib|node-fetch|undici|axios|Go-http-client|Playwright|Puppeteer|\bbot\b|bot\/|crawler|spider/i;

export function isCheckTraffic(headers: Headers): boolean {
  if (headers.get(CHECK_HEADER)) return true;
  return CHECK_AGENT.test(headers.get("user-agent") ?? "");
}

// Lighthouse/PageSpeed, headless browsers, crawlers, link unfurlers and HTTP libraries. On 2026-10-31 all 273 calls
// came from PageSpeed (Chrome-Lighthouse, 199 requests) and our own HeadlessChrome checks (81); real visitors ~0.
const AUTOMATED_UA = /bot\b|bot\/|crawl|spider|slurp|lighthouse|headless|pagespeed|gtmetrix|pingdom|uptime|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|curl\/|wget|python|node-fetch|undici|axios|go-http|okhttp|java\/|libwww|httpclient|playwright|puppeteer|selenium|phantomjs/i;

/**
 * True when a request must not spend a Places call: an automated client (empty or known automated user agent) or a
 * speculative load (prefetch / prerender before the visitor opens the page). Such requests get "photo unavailable".
 */
export function isAutomatedPlacesRequest(headers: Headers): boolean {
  const purpose = `${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""} ${headers.get("x-purpose") ?? ""}`;
  if (/prefetch|prerender|preview/i.test(purpose)) return true;
  const ua = headers.get("user-agent")?.trim() ?? "";
  return !ua || AUTOMATED_UA.test(ua);
}

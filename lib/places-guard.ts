// Lighthouse/PageSpeed, headless browsers, crawlers, link unfurlers and HTTP libraries. On 2026-10-31 all 273 calls
// came from PageSpeed (Chrome-Lighthouse, 199 requests) and our own HeadlessChrome checks (81); real visitors ~0.
const AUTOMATED_UA = /bot\b|bot\/|crawl|spider|slurp|lighthouse|headless|pagespeed|gtmetrix|pingdom|uptime|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|curl\/|wget|python|node-fetch|undici|axios|go-http|okhttp|java\/|libwww|httpclient|playwright|puppeteer|selenium|phantomjs/i;

// Client hints show headless Chromium even when a test emulates a phone or desktop UA (Playwright devices).
const HEADLESS_HINT = /headless/i;
// Networks no real visitor browses from. On 2026-11-03 our own ci-1 e2e and agent-host checks (Hetzner, 715 of 1089
// photo requests, emulated UAs) and Meta's browser-like crawlers (2a03:2880::/32) used the whole daily cap.
// cf-connecting-ip is set by Cloudflare; a client cannot forge it.
const AUTOMATED_IPV6_PREFIXES = [
  /^2a01:4f[89a-f]:/i, // Hetzner 2a01:4f8::/29 (agent host, ci-1 and our other servers)
  /^2a03:2880:/i, // Meta crawlers 2a03:2880::/32
];

// Cloud and hosting networks (ASN, from Cloudflare request.cf). On 2026-11-16 the daily cap (600) was used by 18:52
// UTC while real card views were 54: a Worker tail showed Huawei Cloud renderers with plain desktop Chrome user agents
// calling the photo APIs, plus Amazon crawlers. Consumer ISPs, mobile carriers and privacy relays (Cloudflare WARP
// 13335, iCloud Private Relay on Akamai 36183 / Fastly 54113) are deliberately NOT listed.
export const DATACENTER_ASNS: ReadonlySet<number> = new Set([
  16509, 14618, // Amazon AWS
  396982, // Google Cloud
  8075, // Microsoft Azure
  136907, 55990, 265443, // Huawei Cloud
  45102, 37963, // Alibaba Cloud
  132203, 45090, // Tencent Cloud
  14061, // DigitalOcean
  24940, 213230, // Hetzner
  16276, // OVH
  31898, // Oracle Cloud
  63949, // Akamai Linode
  20473, // Vultr
  51167, // Contabo
  12876, // Scaleway
  32934, // Meta (IPv4 crawlers with desktop Chrome user agents; 2026-11-16 request_exception from it, Push CF3)
]);

/** The caller's ASN from the Cloudflare request context (set by the OpenNext Worker; a client cannot forge it). */
export function requestAsn(): number | undefined {
  const context = (globalThis as Record<symbol, { cf?: { asn?: unknown } } | undefined>)[Symbol.for("__cloudflare-context__")];
  const asn = Number(context?.cf?.asn);
  return Number.isInteger(asn) && asn > 0 ? asn : undefined;
}

/**
 * True when a request must not spend a Places call: an automated client (empty or known automated user agent) or a
 * speculative load (prefetch / prerender before the visitor opens the page), headless client hints, or a request
 * from our own servers, a crawler network or a cloud/hosting network (ASN). Such requests get "photo unavailable".
 */
export function isAutomatedPlacesRequest(headers: Headers, asn: number | undefined = requestAsn()): boolean {
  if (asn !== undefined && DATACENTER_ASNS.has(asn)) return true;
  const purpose = `${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""} ${headers.get("x-purpose") ?? ""}`;
  if (/prefetch|prerender|preview/i.test(purpose)) return true;
  if (HEADLESS_HINT.test(headers.get("sec-ch-ua") ?? "")) return true;
  const ip = headers.get("cf-connecting-ip")?.trim() ?? "";
  if (AUTOMATED_IPV6_PREFIXES.some((prefix) => prefix.test(ip))) return true;
  const ua = headers.get("user-agent")?.trim() ?? "";
  return !ua || AUTOMATED_UA.test(ua);
}

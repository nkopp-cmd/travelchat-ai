import type { NextRequest } from "next/server";

export const AFFILIATE_CLICK_PARTNERS = ["viator", "booking", "getyourguide", "klook"] as const;
export const AFFILIATE_CLICK_EVENTS = ["click", "view", "conversion"] as const;

export interface AffiliateClick {
  partner: (typeof AFFILIATE_CLICK_PARTNERS)[number];
  trackingId: string;
  eventType: (typeof AFFILIATE_CLICK_EVENTS)[number];
  activityName: string | null;
  affiliateUrl: string | null;
}

const trackingIdPattern = /^[A-Za-z0-9._:-]{1,120}$/;

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > max) return undefined;
  return value;
}

/** Validates an affiliate event; null means reject with 400. Unknown extra fields are ignored. */
export function parseAffiliateClick(input: {
  partner?: unknown; trackingId?: unknown; eventType?: unknown; activityName?: unknown; url?: unknown;
}): AffiliateClick | null {
  const { partner, trackingId, eventType } = input;
  if (typeof partner !== "string" || !(AFFILIATE_CLICK_PARTNERS as readonly string[]).includes(partner)) return null;
  if (typeof trackingId !== "string" || !trackingIdPattern.test(trackingId)) return null;
  if (typeof eventType !== "string" || !(AFFILIATE_CLICK_EVENTS as readonly string[]).includes(eventType)) return null;
  const activityName = typeof input.activityName === "string"
    ? optionalText(input.activityName.trim().slice(0, 200), 200) : optionalText(input.activityName, 200);
  const affiliateUrl = optionalText(input.url, 2048);
  if (activityName === undefined || affiliateUrl === undefined) return null;
  if (affiliateUrl !== null && !/^https:\/\//.test(affiliateUrl)) return null;
  return { partner: partner as AffiliateClick["partner"], trackingId,
    eventType: eventType as AffiliateClick["eventType"], activityName, affiliateUrl };
}

/** Short non-reversible IP bucket for fraud checks; never stores the address. */
export function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(16);
}

export function clickIp(req: NextRequest): string {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function clickUserAgent(req: NextRequest): string | null {
  return req.headers.get("user-agent")?.slice(0, 300) || null;
}

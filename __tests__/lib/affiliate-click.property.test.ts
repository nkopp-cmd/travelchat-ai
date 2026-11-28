// Push ED3: booking-link revenue is counted from parseAffiliateClick(); hashIP() is the only IP trace kept.
// Invariants: only allowlisted values pass, URLs are https and bounded, the raw IP is never stored.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  AFFILIATE_CLICK_EVENTS,
  AFFILIATE_CLICK_PARTNERS,
  hashIP,
  parseAffiliateClick,
} from "@/lib/affiliate-click";

const loose = fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(undefined), fc.boolean());
const partner = fc.oneof(fc.constantFrom(...AFFILIATE_CLICK_PARTNERS), loose);
const eventType = fc.oneof(fc.constantFrom(...AFFILIATE_CLICK_EVENTS), loose);
const trackingId = fc.oneof(fc.stringMatching(/^[A-Za-z0-9._:-]{1,120}$/), loose);
const url = fc.oneof(
  fc.webUrl({ validSchemes: ["https"] }),
  fc.webUrl({ validSchemes: ["http"] }),
  fc.constantFrom("javascript:alert(1)", "data:text/html,x", "//evil.example", "https://x.example/" + "a".repeat(2100)),
  loose,
);
const activityName = fc.oneof(fc.string({ maxLength: 260 }), loose);
const input = fc.record({ partner, trackingId, eventType, activityName, url });

describe("parseAffiliateClick invariants", () => {
  it("an accepted click has an allowlisted partner and event, a valid tracking id and a bounded https URL", () => {
    fc.assert(
      fc.property(input, (raw) => {
        const click = parseAffiliateClick(raw);
        if (click === null) return;
        expect(AFFILIATE_CLICK_PARTNERS).toContain(click.partner);
        expect(AFFILIATE_CLICK_EVENTS).toContain(click.eventType);
        expect(click.trackingId).toMatch(/^[A-Za-z0-9._:-]{1,120}$/);
        if (click.affiliateUrl !== null) {
          expect(click.affiliateUrl.startsWith("https://")).toBe(true);
          expect(click.affiliateUrl.length).toBeLessThanOrEqual(2048);
        }
        if (click.activityName !== null) expect(click.activityName.length).toBeLessThanOrEqual(200);
      }),
    );
  });

  it("an unknown partner or event is always rejected", () => {
    fc.assert(
      fc.property(input, (raw) => {
        const knownPartner = typeof raw.partner === "string" && (AFFILIATE_CLICK_PARTNERS as readonly string[]).includes(raw.partner);
        const knownEvent = typeof raw.eventType === "string" && (AFFILIATE_CLICK_EVENTS as readonly string[]).includes(raw.eventType);
        if (!knownPartner || !knownEvent) expect(parseAffiliateClick(raw)).toBeNull();
      }),
    );
  });

  it("a valid click with an https URL is accepted unchanged", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...AFFILIATE_CLICK_PARTNERS), fc.constantFrom(...AFFILIATE_CLICK_EVENTS),
        fc.stringMatching(/^[A-Za-z0-9._:-]{1,120}$/), fc.webUrl({ validSchemes: ["https"] }).filter((u) => u.length <= 2048),
        (p, e, id, u) => {
          expect(parseAffiliateClick({ partner: p, eventType: e, trackingId: id, url: u }))
            .toEqual({ partner: p, eventType: e, trackingId: id, activityName: null, affiliateUrl: u });
        },
      ),
    );
  });
});

describe("hashIP invariants", () => {
  it("never returns the address itself and is stable", () => {
    fc.assert(
      fc.property(fc.oneof(fc.ipV4(), fc.ipV6()), (ip) => {
        const h = hashIP(ip);
        expect(h).not.toBe(ip);
        expect(h).not.toContain(".");
        expect(h).not.toContain(":");
        expect(h).toMatch(/^-?[0-9a-f]+$/);
        expect(hashIP(ip)).toBe(h);
      }),
    );
  });
});

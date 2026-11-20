// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { referralPoint } from "@/lib/referral-point";

const SAFE = /^[a-z0-9._-]*$/;
const OWN = /(^|\.)localley\.(io|app)$/i;
const field = fc.oneof(
  fc.string({ maxLength: 200 }),
  fc.webUrl().map(u => new URL(u).hostname),
  fc.constantFrom("www.localley.io", "localley.app", "LOCALLEY.IO", "news.ycombinator.com", "/help/korea", "/a?b=<c>"),
  fc.anything(),
);
const body = fc.oneof(
  fc.record({ s: field, m: field, c: field, r: field, p: field }, { requiredKeys: [] }),
  fc.anything(),
);

describe("referralPoint properties (sign-up source attribution)", () => {
  it("returns null or a bounded, sanitized Analytics Engine point for any body", () => {
    fc.assert(fc.property(body, (input) => {
      const point = referralPoint(input);
      if (point === null) return;
      expect(point.blobs).toHaveLength(5);
      const [source, medium, campaign, host, path] = point.blobs;
      for (const [value, max] of [[source, 40], [medium, 40], [campaign, 60], [host, 80]] as const) {
        expect(value.length).toBeLessThanOrEqual(max);
        expect(value).toMatch(SAFE);
      }
      expect(path.length).toBeLessThanOrEqual(100);
      expect(path === "" || /^\/[\w\-./]*$/.test(path)).toBe(true);
      expect(OWN.test(host)).toBe(false);
      expect(point.indexes).toEqual([source || host]);
      expect(point.indexes[0].length).toBeGreaterThan(0);
      // Analytics Engine index limit is 96 bytes; all chars are ASCII here.
      expect(new TextEncoder().encode(point.indexes[0]).length).toBeLessThanOrEqual(96);
    }), { numRuns: 2000 });
  });

  it("counts a landing only when it has a utm source or an outside referrer", () => {
    fc.assert(fc.property(fc.record({ s: fc.string(), r: fc.string() }), ({ s, r }) => {
      const clean = (v: string, max: number) => v.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, max);
      const source = clean(s, 40);
      const host = clean(r, 80);
      const outside = host !== "" && !OWN.test(host);
      expect(referralPoint({ s, r }) !== null).toBe(source !== "" || outside);
    }), { numRuns: 2000 });
  });
});

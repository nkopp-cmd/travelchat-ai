// Push ED2: after payment Stripe sends the buyer to checkoutReturnPaths(); the paid count reads
// checkoutPaidSource(). Invariants: no open redirect, only allowlisted keys, the paid source is a known value.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_SOURCES,
  checkoutPaidSource,
  checkoutReturnPaths,
  isCheckoutReturnTo,
  isCheckoutSource,
} from "@/lib/checkout-source";

const ALLOWED_RETURNS = ["itinerary-preview", "planner"];
const PROTOTYPE_KEYS = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "prototype"];
const anyValue = fc.oneof(
  fc.string(),
  fc.constantFrom(...PROTOTYPE_KEYS, ...ALLOWED_RETURNS, ...CHECKOUT_SOURCES, "//evil.example", "https://evil.example"),
  fc.integer(), fc.boolean(), fc.constant(null), fc.object(),
);

const sameOriginPath = (p: string) => p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") && !/^\/[^/?#]*:/.test(p);

describe("checkoutReturnPaths invariants", () => {
  it("every result is a same-origin relative path, or null", () => {
    fc.assert(
      fc.property(fc.option(anyValue, { nil: undefined }), (value) => {
        const paths = checkoutReturnPaths(value);
        if (paths === null) return;
        expect(sameOriginPath(paths.success)).toBe(true);
        expect(sameOriginPath(paths.cancel)).toBe(true);
      }),
    );
  });

  it("only undefined and the allowlist give paths; prototype keys never do", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const allowed = typeof value === "string" && ALLOWED_RETURNS.includes(value);
        expect(isCheckoutReturnTo(value)).toBe(allowed);
        expect(checkoutReturnPaths(value) !== null).toBe(allowed);
      }),
    );
    for (const key of PROTOTYPE_KEYS) expect(checkoutReturnPaths(key)).toBeNull();
    expect(checkoutReturnPaths(undefined)).toEqual({ success: "/settings?subscription=success", cancel: "/pricing?canceled=true" });
  });

  it("a paid return never lands on a cancel page and a cancel never claims success", () => {
    for (const value of [undefined, ...ALLOWED_RETURNS]) {
      const paths = checkoutReturnPaths(value)!;
      expect(paths.success).toMatch(/success/);
      expect(paths.cancel).not.toMatch(/success/);
    }
  });
});

describe("checkoutPaidSource invariants", () => {
  it("always returns a known source or 'stripe', and keeps a known source unchanged", () => {
    fc.assert(
      fc.property(anyValue, (value) => {
        const source = checkoutPaidSource(value);
        expect([...CHECKOUT_SOURCES, "stripe"]).toContain(source);
        if (isCheckoutSource(value)) expect(source).toBe(value);
        else expect(source).toBe("stripe");
      }),
    );
  });
});

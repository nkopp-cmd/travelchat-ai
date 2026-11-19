// Push AR2: the admin payout calculate body. A valid result never yields a share above 50 %, a negative pool
// or an invalid month; every present invalid field is refused with its name.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseCalculateBody } from "@/lib/payout-calculate-input";

const anyValue = fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.boolean(),
    fc.string(),
    fc.double(),
    fc.integer({ min: -1000, max: 1000 }),
    fc.constantFrom("20", "2026-03-01", "2026-02-30", "2026-13-01", "2026-03-15", "2026-3-01")
);

describe("parseCalculateBody", () => {
    it("absent fields take defaults (share 20, no month, no override)", () => {
        expect(parseCalculateBody({})).toEqual({
            ok: true,
            value: { month: undefined, subscriptionRevenue: undefined, revenueSharePercent: 20 },
        });
    });

    it.each([
        [null, "body"],
        [[], "body"],
        [5, "body"],
        [{ month: "invalid" }, "month"],
        [{ month: "2026-03-15" }, "month"],
        [{ month: "2026-02-30" }, "month"],
        [{ month: "2026-13-01" }, "month"],
        [{ month: 202603 }, "month"],
        [{ subscriptionRevenue: -5 }, "subscriptionRevenue"],
        [{ subscriptionRevenue: "1000" }, "subscriptionRevenue"],
        [{ subscriptionRevenue: Number.POSITIVE_INFINITY }, "subscriptionRevenue"],
        [{ subscriptionRevenue: null }, "subscriptionRevenue"],
        [{ revenueSharePercent: 0 }, "revenueSharePercent"],
        [{ revenueSharePercent: 200 }, "revenueSharePercent"],
        [{ revenueSharePercent: 50.0001 }, "revenueSharePercent"],
        [{ revenueSharePercent: -5 }, "revenueSharePercent"],
        [{ revenueSharePercent: "20" }, "revenueSharePercent"],
        [{ revenueSharePercent: Number.NaN }, "revenueSharePercent"],
    ])("refuses %j on field %s", (body, field) => {
        expect(parseCalculateBody(body)).toEqual({ ok: false, field });
    });

    it("accepts the boundaries: share 50, revenue 0, first of month", () => {
        const r = parseCalculateBody({ month: "2026-03-01", subscriptionRevenue: 0, revenueSharePercent: 50 });
        expect(r.ok && r.value.month?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
        expect(r.ok && r.value.revenueSharePercent).toBe(50);
    });

    it("an accepted body never gives a share outside (0, 50], a negative or non-finite revenue, or a non-first month", () => {
        fc.assert(
            fc.property(anyValue, anyValue, anyValue, (month, subscriptionRevenue, revenueSharePercent) => {
                const body: Record<string, unknown> = {};
                if (month !== undefined) body.month = month;
                if (subscriptionRevenue !== undefined) body.subscriptionRevenue = subscriptionRevenue;
                if (revenueSharePercent !== undefined) body.revenueSharePercent = revenueSharePercent;
                const r = parseCalculateBody(body);
                if (!r.ok) return;
                const { value } = r;
                expect(value.revenueSharePercent).toBeGreaterThan(0);
                expect(value.revenueSharePercent).toBeLessThanOrEqual(50);
                if (value.subscriptionRevenue !== undefined) {
                    expect(Number.isFinite(value.subscriptionRevenue)).toBe(true);
                    expect(value.subscriptionRevenue).toBeGreaterThanOrEqual(0);
                    // pool can never exceed the revenue it comes from
                    expect((value.subscriptionRevenue * value.revenueSharePercent) / 100).toBeLessThanOrEqual(value.subscriptionRevenue);
                }
                if (value.month !== undefined) expect(value.month.getUTCDate()).toBe(1);
                if (revenueSharePercent === undefined) expect(value.revenueSharePercent).toBe(20);
            }),
            { numRuns: 1000 }
        );
    });
});

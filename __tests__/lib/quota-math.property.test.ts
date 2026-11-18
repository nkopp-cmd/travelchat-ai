// Push AN1: property tests for the quota math that gates paid LLM/image usage (CLAUDE.md: a critical
// calculation ships with its property test). Pure functions only; no database.
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

import {
    TIER_CONFIGS,
    compareTiers,
    getRemainingUsage,
    isWithinLimit,
    needsUpgrade,
    type SubscriptionLimits,
    type SubscriptionTier,
} from "@/lib/subscription";
import { getPeriodEnd, getPeriodStart, parseAtomicUsage, type PeriodType } from "@/lib/usage-tracking";

const TIERS: SubscriptionTier[] = ["free", "pro", "premium"];
const LIMIT_KEYS = Object.keys(TIER_CONFIGS.free.limits) as (keyof SubscriptionLimits)[];
const tier = fc.constantFrom(...TIERS);
const limitKey = fc.constantFrom(...LIMIT_KEYS);
const usage = fc.integer({ min: 0, max: 5_000 });
const DAY = 86_400_000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
// Workers run in UTC; pin it so the local-time Date math matches production.
const originalTz = process.env.TZ;
beforeAll(() => { process.env.TZ = "UTC"; });
afterAll(() => { process.env.TZ = originalTz; });

describe("tier limits", () => {
    it("a higher tier never has a lower limit or price than a lower tier", () => {
        fc.assert(fc.property(tier, tier, limitKey, (a, b, key) => {
            if (compareTiers(a, b) > 0) {
                expect(TIER_CONFIGS[a].limits[key]).toBeGreaterThanOrEqual(TIER_CONFIGS[b].limits[key]);
                expect(TIER_CONFIGS[a].price).toBeGreaterThan(TIER_CONFIGS[b].price);
            }
        }));
    });

    it("every limit is a non-negative safe integer (the atomic RPC takes INTEGER)", () => {
        for (const t of TIERS) for (const k of LIMIT_KEYS) {
            expect(Number.isSafeInteger(TIER_CONFIGS[t].limits[k])).toBe(true);
            expect(TIER_CONFIGS[t].limits[k]).toBeGreaterThanOrEqual(0);
        }
    });

    it("isWithinLimit agrees with remaining > 0; remaining stays in [0, limit]", () => {
        fc.assert(fc.property(tier, limitKey, usage, (t, key, used) => {
            const limit = TIER_CONFIGS[t].limits[key];
            const remaining = getRemainingUsage(t, key, used);
            expect(isWithinLimit(t, key, used)).toBe(remaining > 0);
            expect(remaining).toBeGreaterThanOrEqual(0);
            expect(remaining).toBeLessThanOrEqual(limit);
            if (used <= limit) expect(remaining).toBe(limit - used);
        }));
    });

    it("compareTiers is a total order and needsUpgrade follows it", () => {
        fc.assert(fc.property(tier, tier, tier, (a, b, c) => {
            expect(Math.sign(compareTiers(a, b)) + Math.sign(compareTiers(b, a))).toBe(0);
            expect(compareTiers(a, b) === 0).toBe(a === b);
            if (compareTiers(a, b) <= 0 && compareTiers(b, c) <= 0) expect(compareTiers(a, c)).toBeLessThanOrEqual(0);
            expect(needsUpgrade(a, b)).toBe(compareTiers(a, b) < 0);
            expect(needsUpgrade(a, a)).toBe(false);
        }));
    });
});

describe("atomic reservation response", () => {
    const anyRow = fc.record({
        allowed: fc.oneof(fc.boolean(), fc.constant("true" as unknown as boolean)),
        new_count: fc.oneof(fc.integer({ min: -5, max: 300 }), fc.double(), fc.constant(Infinity), fc.constant(NaN)),
        was_at_limit: fc.oneof(fc.boolean(), fc.constant(null as unknown as boolean)),
    });
    const shape = fc.oneof(anyRow, fc.array(anyRow, { maxLength: 3 }), fc.constant(null), fc.constant("x"));

    it("never grants a unit above the limit or with a non-integer count", () => {
        fc.assert(fc.property(shape, fc.integer({ min: 0, max: 200 }), (data, limit) => {
            const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
            const result = parseAtomicUsage(data, limit);
            spy.mockRestore();
            if (result.allowed) {
                expect(Number.isSafeInteger(result.newCount)).toBe(true);
                expect(result.newCount).toBeGreaterThanOrEqual(0);
                expect(result.newCount).toBeLessThanOrEqual(limit);
                expect(result.wasAtLimit).toBe(false);
            }
        }));
    });

    it("keeps a valid single-row grant unchanged", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 0, max: 200 }), (limit, n) => {
            const count = Math.min(n, limit);
            expect(parseAtomicUsage([{ allowed: true, new_count: count, was_at_limit: false }], limit))
                .toEqual({ allowed: true, newCount: count, wasAtLimit: false });
        }));
    });
});

describe("usage period window", () => {
    const instant = fc.integer({ min: Date.UTC(2020, 0, 1), max: Date.UTC(2035, 11, 31, 23, 59, 59) }).map((ms) => new Date(ms));
    const period = fc.constantFrom<PeriodType>("daily", "weekly", "monthly");

    it("start <= today < end, for any instant", () => {
        fc.assert(fc.property(period, instant, (p, at) => {
            const today = day(at.toISOString().slice(0, 10));
            expect(day(getPeriodStart(p, at))).toBeLessThanOrEqual(today);
            expect(day(getPeriodEnd(p, at))).toBeGreaterThan(today);
        }));
    });

    it("windows have the right shape: 1 day, Monday + 7 days, first of month to first of next", () => {
        fc.assert(fc.property(instant, (at) => {
            expect(day(getPeriodEnd("daily", at)) - day(getPeriodStart("daily", at))).toBe(DAY);
            const weekStart = new Date(day(getPeriodStart("weekly", at)));
            expect(weekStart.getUTCDay()).toBe(1);
            expect(day(getPeriodEnd("weekly", at)) - weekStart.getTime()).toBe(7 * DAY);
            const monthStart = getPeriodStart("monthly", at);
            expect(monthStart).toBe(`${at.toISOString().slice(0, 7)}-01`);
            const next = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
            expect(getPeriodEnd("monthly", at)).toBe(next);
        }));
    });

    it("does not change the instant it is given", () => {
        fc.assert(fc.property(period, instant, (p, at) => {
            const before = at.getTime();
            getPeriodStart(p, at); getPeriodEnd(p, at);
            expect(at.getTime()).toBe(before);
        }));
    });
});

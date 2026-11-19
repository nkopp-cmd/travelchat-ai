// Push AR3: guide payouts come only from Localley subscription money. Property test over random paid-invoice
// pages from Stripe (other products, missing pricing, several lines, multi-page has_more): the calculate route
// sums amount_paid only of invoices with a Localley price line, follows every page, and the pool is a share of it.
import fc from "fast-check";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), invoices: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({
    createSupabaseAdmin: () => ({
        rpc: mocks.rpc,
        from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [] }) }) }) }),
    }),
}));
vi.mock("@/lib/stripe", () => ({
    STRIPE_PRICE_IDS: {
        pro: { monthly: "price_pro_m", yearly: "price_pro_y" },
        premium: { monthly: "price_prem_m", yearly: "" }, // an unset env must not match a line without a price
    },
    stripe: { invoices: { list: mocks.invoices } },
}));

const LOCALLEY = ["price_pro_m", "price_pro_y", "price_prem_m"];
const ADMIN = "admin_user";
const original = process.env;
let POST: typeof import("@/app/api/admin/payouts/calculate/route").POST;

type Line = { pricing?: { price_details?: { price?: string } | null } | null };
type Invoice = { id: string; amount_paid: number | null; lines?: { data: Line[] } };

const line: fc.Arbitrary<Line> = fc.oneof(
    fc.constantFrom(...LOCALLEY).map((price) => ({ pricing: { price_details: { price } } })),
    fc.constantFrom("price_other_shop", "price_pro_m_x", "PRICE_PRO_M").map((price) => ({ pricing: { price_details: { price } } })),
    fc.constant({ pricing: { price_details: { price: "" } } }),
    fc.constant({ pricing: { price_details: null } }),
    fc.constant({ pricing: null }),
    fc.constant({})
);
const invoiceBody = fc.record(
    {
        amount_paid: fc.oneof(fc.integer({ min: 0, max: 50_000 }), fc.constant(null)),
        lines: fc.array(line, { maxLength: 3 }).map((data) => ({ data })),
    },
    { requiredKeys: ["amount_paid"] }
);
// Non-empty pages: Stripe never sends an empty page with has_more = true.
const pages = fc.array(fc.array(invoiceBody, { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 4 });

const isLocalley = (inv: Invoice) =>
    inv.lines?.data.some((l) => LOCALLEY.includes(l.pricing?.price_details?.price ?? "")) ?? false;

beforeAll(async () => {
    process.env = { ...original, ADMIN_USER_IDS: ADMIN };
    ({ POST } = await import("@/app/api/admin/payouts/calculate/route"));
});
afterAll(() => {
    process.env = original;
});
beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ userId: ADMIN });
    mocks.invoices.mockReset();
    mocks.rpc.mockReset().mockResolvedValue({ data: 0, error: null });
});

async function run(raw: { amount_paid: number | null; lines?: { data: Line[] } }[][], share?: number) {
    let n = 0;
    const withIds: Invoice[][] = raw.map((page) => page.map((inv) => ({ ...inv, id: `in_${n++}` })));
    mocks.invoices.mockReset();
    withIds.forEach((data, i) => mocks.invoices.mockResolvedValueOnce({ data, has_more: i < withIds.length - 1 }));
    const body = JSON.stringify(share === undefined ? { month: "2026-03-01" } : { month: "2026-03-01", revenueSharePercent: share });
    const res = await POST(new NextRequest("https://www.localley.io/api/admin/payouts/calculate", { method: "POST", body }));
    return { res, withIds };
}

describe("payout revenue sum", () => {
    it("revenue = sum(amount_paid of Localley invoices) / 100 over every page; pool = revenue * share / 100 <= revenue", async () => {
        await fc.assert(
            fc.asyncProperty(pages, fc.oneof(fc.constant(undefined), fc.integer({ min: 1, max: 50 })), async (raw, share) => {
                const { res, withIds } = await run(raw, share);
                expect(res.status).toBe(200);
                const json = await res.json();
                const cents = withIds.flat().filter(isLocalley).reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
                const pct = share ?? 20;
                expect(json.subscriptionRevenue).toBeCloseTo(cents / 100, 6);
                expect(json.revenueSharePercent).toBe(pct);
                expect(json.revenuePool).toBeCloseTo((cents / 100) * (pct / 100), 6);
                expect(json.revenuePool).toBeLessThanOrEqual(json.subscriptionRevenue + 1e-9);
                // every page is read, each next page starts after the last id of the one before
                expect(mocks.invoices).toHaveBeenCalledTimes(withIds.length);
                withIds.slice(0, -1).forEach((page, i) => {
                    expect(mocks.invoices.mock.calls[i + 1][0].starting_after).toBe(page[page.length - 1].id);
                });
                expect(mocks.rpc).toHaveBeenLastCalledWith("calculate_monthly_earnings", {
                    p_month: "2026-03-01",
                    p_subscription_revenue: json.subscriptionRevenue,
                    p_revenue_share_percent: pct,
                });
            }),
            { numRuns: 200 }
        );
    });

    it("only other products and price-less lines give a zero pool", async () => {
        const { res } = await run([
            [
                { amount_paid: 9900, lines: { data: [{ pricing: { price_details: { price: "price_other_shop" } } }] } },
                { amount_paid: 1900, lines: { data: [{ pricing: { price_details: { price: "" } } }, { pricing: null }] } },
                { amount_paid: 500 },
            ],
        ]);
        expect(await res.json()).toMatchObject({ subscriptionRevenue: 0, revenuePool: 0 });
    });
});

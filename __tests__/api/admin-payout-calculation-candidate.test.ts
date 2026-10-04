import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), invoices: vi.fn(), rpc: vi.fn(), earnings: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/stripe", () => ({ STRIPE_PRICE_IDS: { pro: { monthly: "price_local" } }, stripe: { invoices: { list: mocks.invoices } } }));
const admins = ["user_38VRkLQbwVNbAqR9lBXTMGXr54h", "eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx"];
const host = "localley-next-preview.nkopp.workers.dev", original = process.env;
let POST: typeof import("@/app/api/admin/payouts/calculate/route").POST;
const request = (hostname = host, query = "?data_candidate=d1", body = '{"month":"2026-03-01"}') =>
    new NextRequest(`https://${hostname}/api/admin/payouts/calculate${query}`, { method: "POST", body });
const invoice = (id: string, amount_paid: number, price: string) => ({ id, amount_paid, lines: { data: [{ pricing: { price_details: { price } } }] } });
beforeEach(async () => {
    vi.resetAllMocks(); vi.resetModules();
    process.env = { ...original, ADMIN_USER_IDS: admins.join(","), AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: admins[0] });
    mocks.invoices.mockResolvedValueOnce({ data: [invoice("in_first", 1000, "price_local")], has_more: true })
        .mockResolvedValueOnce({ data: [invoice("in_foreign", 9999, "price_foreign"), invoice("in_last", 1500, "price_local")], has_more: false });
    mocks.rpc.mockResolvedValue({ data: 2, error: null }); mocks.earnings.mockResolvedValue({ data: [] });
    mocks.source.mockReturnValue({ rpc: mocks.rpc, from: () => ({ select: () => ({ eq: () => ({ order: mocks.earnings }) }) }) });
    ({ POST } = await import("@/app/api/admin/payouts/calculate/route"));
});
afterEach(() => { process.env = original; });
const noFinancialCalls = () => { expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.invoices).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.earnings).not.toHaveBeenCalled(); };
describe("admin payout calculation candidate boundary", () => {
    it.each(admins)("refuses retained admin %s before parsing or financial calls", async userId => {
        mocks.auth.mockResolvedValue({ userId }); const req = request(), parse = vi.spyOn(req, "json");
        const r = await POST(req); expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: { code: "feature_disabled", message: "Billing changes are unavailable in this preview." } });
        expect(r.headers.get("cache-control")).toBe("no-store"); expect(r.headers.get("x-localley-data-source")).toBe("d1-preview");
        expect(parse).not.toHaveBeenCalled(); noFinancialCalls();
    });
    it.each(["", "{", '{"month":"invalid","subscriptionRevenue":1000000}'])("refuses candidate body %s", async body => {
        expect((await POST(request(host, "?data_candidate=d1", body))).status).toBe(503); noFinancialCalls();
    });
    it.each([{}, { AUTH_MAIL_MODE: "send", SUPABASE_READ_ONLY: "false" }])("refuses with absent or unsafe settings", async vars => {
        process.env = { ...process.env, AUTH_MAIL_MODE: undefined, SUPABASE_READ_ONLY: undefined, ...vars };
        expect((await POST(request())).status).toBe(503); noFinancialCalls();
    });
    it.each([[null, 401], ["fresh-non-admin", 403]])("preserves authorization denial %s", async (userId, status) => {
        mocks.auth.mockResolvedValue({ userId }); expect((await POST(request())).status).toBe(status);
        expect(mocks.auth).toHaveBeenCalledTimes(1); noFinancialCalls();
    });
    it.each([[host, ""], [host, "?data_candidate=other"], [host, "?data_candidate=other&data_candidate=d1"], ["www.localley.io", "?data_candidate=d1"], ["localley.io", "?data_candidate=d1"], [host + ".attacker.test", "?data_candidate=d1"]])("preserves normal invoice pagination and source RPC %s %s", async (hostname, query) => {
        const r = await POST(request(hostname, query)); expect(r.status).toBe(200);
        expect(await r.json()).toEqual({ month: "2026-03-01", subscriptionRevenue: 25, revenueSharePercent: 20, revenuePool: 5, guidesWithEarnings: 2, earnings: [] });
        const range = { gte: Date.UTC(2026, 2, 1) / 1000, lt: Date.UTC(2026, 3, 1) / 1000 };
        expect(mocks.invoices).toHaveBeenNthCalledWith(1, { created: range, status: "paid", limit: 100 });
        expect(mocks.invoices).toHaveBeenNthCalledWith(2, { created: range, status: "paid", limit: 100, starting_after: "in_first" });
        expect(mocks.rpc).toHaveBeenCalledWith("calculate_monthly_earnings", { p_month: "2026-03-01", p_subscription_revenue: 25, p_revenue_share_percent: 20 });
        expect(r.headers.get("x-localley-data-source")).toBeNull(); expect(mocks.auth).toHaveBeenCalledTimes(1);
    });
    it("honors the first candidate flag", async () => { expect((await POST(request(host, "?data_candidate=d1&data_candidate=other"))).status).toBe(503); noFinancialCalls(); });
    it("retains normal manual overrides after invoice reads", async () => {
        const r = await POST(request(host, "", '{"month":"2026-03-01","subscriptionRevenue":7,"revenueSharePercent":50}'));
        expect(r.status).toBe(200); expect((await r.json()).revenuePool).toBe(3.5); expect(mocks.invoices).toHaveBeenCalledTimes(2);
        expect(mocks.rpc).toHaveBeenCalledWith("calculate_monthly_earnings", { p_month: "2026-03-01", p_subscription_revenue: 7, p_revenue_share_percent: 50 });
    });
    it("retains normal invalid-date refusal before provider or source calls", async () => {
        expect((await POST(request(host, "", '{"month":"invalid"}'))).status).toBe(500); noFinancialCalls();
    });
});

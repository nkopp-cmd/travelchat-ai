import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), transfer: vi.fn(), query: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/stripe-connect", () => ({ createTransfer: mocks.transfer }));
const admins = ["user_38VRkLQbwVNbAqR9lBXTMGXr54h", "eRrDwrrwjwO1YsxVlci7M6mMjjqPtyYx"];
const host = "localley-next-preview.nkopp.workers.dev", original = process.env;
let POST: typeof import("@/app/api/admin/payouts/execute/route").POST;
const request = (hostname = host, query = "?data_candidate=d1", body = '{"month":"2026-03-01"}') =>
    new NextRequest(`https://${hostname}/api/admin/payouts/execute${query}`, { method: "POST", body });
beforeEach(async () => {
    vi.resetAllMocks(); vi.resetModules();
    process.env = { ...original, ADMIN_USER_IDS: admins.join(","), AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: admins[0] });
    const builder = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), then: (resolve: (v: unknown) => unknown) => mocks.query().then(resolve) };
    mocks.query.mockResolvedValue({ data: [], error: null });
    mocks.source.mockReturnValue({ from: () => ({ ...builder, update: mocks.update }) });
    ({ POST } = await import("@/app/api/admin/payouts/execute/route"));
});
afterEach(() => { process.env = original; });
const noFinancialCalls = () => { expect(mocks.source).not.toHaveBeenCalled(); expect(mocks.transfer).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled(); };
describe("admin payout execution candidate boundary", () => {
    it.each(admins)("refuses retained admin %s before parsing or financial calls", async userId => {
        mocks.auth.mockResolvedValue({ userId });
        const req = request(), parse = vi.spyOn(req, "json");
        const r = await POST(req);
        expect(r.status).toBe(503);
        expect(await r.json()).toEqual({ error: { code: "feature_disabled", message: "Billing changes are unavailable in this preview." } });
        expect(r.headers.get("cache-control")).toBe("no-store");
        expect(r.headers.get("x-localley-data-source")).toBe("d1-preview");
        expect(parse).not.toHaveBeenCalled(); noFinancialCalls();
    });
    it.each(["", "{", '{"earningIds":["foreign"]}'])("refuses candidate body %s", async body => {
        expect((await POST(request(host, "?data_candidate=d1", body))).status).toBe(503); noFinancialCalls();
    });
    it.each([{}, { AUTH_MAIL_MODE: "send", SUPABASE_READ_ONLY: "false" }])("never falls back with unsafe or missing settings", async vars => {
        process.env = { ...process.env, AUTH_MAIL_MODE: undefined, SUPABASE_READ_ONLY: undefined, ...vars };
        expect((await POST(request())).status).toBe(503); noFinancialCalls();
    });
    it.each([[null, 401], ["fresh-non-admin", 403]])("preserves authorization denial %s", async (userId, status) => {
        mocks.auth.mockResolvedValue({ userId });
        expect((await POST(request())).status).toBe(status); expect(mocks.auth).toHaveBeenCalledTimes(1); noFinancialCalls();
    });
    it.each([[host, ""], [host, "?data_candidate=other"], [host, "?data_candidate=other&data_candidate=d1"], ["www.localley.io", "?data_candidate=d1"], ["localley.io", "?data_candidate=d1"], [host + ".attacker.test", "?data_candidate=d1"]])("preserves source route %s %s", async (hostname, query) => {
        const r = await POST(request(hostname, query));
        expect(r.status).toBe(200); expect(await r.json()).toEqual({ message: "No approved earnings to process", processed: 0 });
        expect(r.headers.get("x-localley-data-source")).toBeNull(); expect(mocks.source).toHaveBeenCalledTimes(1); expect(mocks.auth).toHaveBeenCalledTimes(1); expect(mocks.transfer).not.toHaveBeenCalled();
    });
    it("honors the first candidate flag", async () => { expect((await POST(request(host, "?data_candidate=d1&data_candidate=other"))).status).toBe(503); noFinancialCalls(); });
    it("preserves normal missing-body validation", async () => { expect((await POST(request(host, "", "{"))).status).toBe(400); expect(mocks.source).toHaveBeenCalledTimes(1); expect(mocks.transfer).not.toHaveBeenCalled(); });
});

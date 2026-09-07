// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    auth: vi.fn(), currentUser: vi.fn(), from: vi.fn(),
    list: vi.fn(), retrieve: vi.fn(), create: vi.fn(), update: vi.fn(),
    checkout: vi.fn(), portal: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ from: mocks.from }) }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: async () => ({ from: mocks.from }) }));
vi.mock("stripe", () => ({
    default: class {
        customers = { list: mocks.list, retrieve: mocks.retrieve, create: mocks.create, update: mocks.update };
        checkout = { sessions: { create: mocks.checkout } };
        billingPortal = { sessions: { create: mocks.portal } };
    },
}));

let stripe: typeof import("@/lib/stripe");
let checkout: typeof import("@/app/api/subscription/checkout/route").POST;
let portal: typeof import("@/app/api/subscription/portal/route").POST;
const owned = { id: "cus_owned", metadata: { clerk_user_id: "user-owner" } };
const foreign = { id: "cus_foreign", metadata: { clerk_user_id: "user-other" } };
const unowned = { id: "cus_unowned", metadata: {} };
const deleted = { id: "cus_deleted", deleted: true };

function query(result: object) {
    const chain = {
        select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(result), upsert: vi.fn().mockResolvedValue(result),
    };
    mocks.from.mockReturnValueOnce(chain);
    return chain;
}

function request(route: string) {
    return new NextRequest(`https://localley.io/api/subscription/${route}`, {
        method: "POST", body: JSON.stringify({ tier: "pro", clerk_user_id: "user-other" }),
    });
}

beforeAll(async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mock_only");
    vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_pro");
    vi.stubEnv("STRIPE_PRO_YEARLY_PRICE_ID", "");
    vi.stubEnv("STRIPE_PREMIUM_MONTHLY_PRICE_ID", "");
    vi.stubEnv("STRIPE_PREMIUM_YEARLY_PRICE_ID", "");
    stripe = await import("@/lib/stripe");
    checkout = (await import("@/app/api/subscription/checkout/route")).POST;
    portal = (await import("@/app/api/subscription/portal/route")).POST;
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.auth.mockResolvedValue({ userId: "user-owner" });
    mocks.currentUser.mockResolvedValue({ emailAddresses: [{ emailAddress: "shared@example.com" }] });
    mocks.list.mockResolvedValue({ data: [] });
    mocks.retrieve.mockResolvedValue(owned);
    mocks.create.mockResolvedValue({ id: "cus_new" });
    mocks.checkout.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.test/session" });
    mocks.portal.mockResolvedValue({ url: "https://billing.stripe.test/session" });
});
afterEach(() => vi.restoreAllMocks());

describe("Stripe customer ownership", () => {
    it.each([foreign, unowned, deleted])("does not claim an email match: $id", async customer => {
        mocks.list.mockResolvedValue({ data: [customer] });
        expect(await stripe.getOrCreateStripeCustomer("user-owner", "shared@example.com")).toBe("cus_new");
        expect(mocks.create).toHaveBeenCalledWith({
            email: "shared@example.com", name: undefined, metadata: { clerk_user_id: "user-owner" },
        });
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("reuses only a same-owner email match, even after another account", async () => {
        mocks.list.mockResolvedValue({ data: [foreign, unowned, owned] });
        expect(await stripe.getOrCreateStripeCustomer("user-owner", "shared@example.com")).toBe(owned.id);
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("prefers a verified durable mapping over email", async () => {
        expect(await stripe.getOrCreateStripeCustomer("user-owner", "changed@example.com", undefined, owned.id)).toBe(owned.id);
        expect(mocks.retrieve).toHaveBeenCalledWith(owned.id);
        expect(mocks.list).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it.each([foreign, unowned, deleted])("refuses an invalid durable mapping: $id", async customer => {
        mocks.retrieve.mockResolvedValue(customer);
        await expect(stripe.getOrCreateStripeCustomer("user-owner", "shared@example.com", undefined, customer.id))
            .rejects.toThrow("ownership");
        expect(mocks.list).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it.each(["", " ", "unknown"])("maps blank or unknown prices %j to free with blank configuration", price => {
        expect(stripe.getTierFromPriceId(price)).toBe("free");
    });

    it("still maps a configured price", () => {
        expect(stripe.getTierFromPriceId("price_pro")).toBe("pro");
    });
});

describe("Subscription checkout", () => {
    it.each(["active", "trialing", "past_due", "canceled"])("preserves paid entitlements with status %s while linking IDs", async status => {
        const paid = { tier: "premium", status, stripe_subscription_id: "sub_paid", stripe_customer_id: null };
        const lookup = query({ data: paid, error: null });
        const write = query({ error: null });
        const response = await checkout(request("checkout"));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/session", sessionId: "cs_test" });
        expect(lookup.eq).toHaveBeenCalledWith("clerk_user_id", "user-owner");
        const patch = write.upsert.mock.calls[0][0];
        expect(patch).toEqual({ clerk_user_id: "user-owner", stripe_customer_id: "cus_new", updated_at: expect.any(String) });
        expect({ ...paid, ...patch }).toMatchObject({ tier: "premium", status, stripe_subscription_id: "sub_paid" });
        expect(write.upsert.mock.calls[0][1]).toEqual({ onConflict: "clerk_user_id" });
    });

    it("uses the authenticated user's durable mapping", async () => {
        query({ data: { stripe_customer_id: owned.id }, error: null });
        query({ error: null });
        expect((await checkout(request("checkout"))).status).toBe(200);
        expect(mocks.retrieve).toHaveBeenCalledWith(owned.id);
        expect(mocks.list).not.toHaveBeenCalled();
        expect(mocks.checkout).toHaveBeenCalledWith(expect.objectContaining({ customer: owned.id }));
    });

    it("creates a link for a missing subscription without setting entitlement fields", async () => {
        query({ data: null, error: null });
        const write = query({ error: null });
        expect((await checkout(request("checkout"))).status).toBe(200);
        expect(write.upsert.mock.calls[0][0]).not.toHaveProperty("tier");
        expect(write.upsert.mock.calls[0][0]).not.toHaveProperty("status");
    });

    it.each([foreign, unowned, deleted])("stops before linking or checkout for invalid mapping: $id", async customer => {
        query({ data: { stripe_customer_id: customer.id }, error: null });
        mocks.retrieve.mockResolvedValue(customer);
        expect((await checkout(request("checkout"))).status).toBe(500);
        expect(mocks.from).toHaveBeenCalledTimes(1);
        expect(mocks.checkout).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it.each(["read", "write"])("stops checkout on database %s failure", async operation => {
        const error = { message: "Database unavailable" };
        query({ data: null, error: operation === "read" ? error : null });
        if (operation === "write") query({ error });
        const response = await checkout(request("checkout"));
        expect(response.status).toBe(500);
        expect((await response.json()).error.code).toBe("database_error");
        expect(mocks.checkout).not.toHaveBeenCalled();
        if (operation === "read") expect(mocks.list).not.toHaveBeenCalled();
    });
});

describe("Subscription portal", () => {
    it("validates the mapped customer before returning the portal URL", async () => {
        const lookup = query({ data: { stripe_customer_id: owned.id }, error: null });
        const response = await portal(request("portal"));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ url: "https://billing.stripe.test/session" });
        expect(lookup.eq).toHaveBeenCalledWith("clerk_user_id", "user-owner");
        expect(mocks.retrieve).toHaveBeenCalledWith(owned.id);
        expect(mocks.portal).toHaveBeenCalledWith(expect.objectContaining({ customer: owned.id }));
    });

    it.each([foreign, unowned, deleted])("denies portal access for invalid mapping: $id", async customer => {
        query({ data: { stripe_customer_id: customer.id }, error: null });
        mocks.retrieve.mockResolvedValue(customer);
        expect((await portal(request("portal"))).status).toBe(500);
        expect(mocks.portal).not.toHaveBeenCalled();
    });

    it("reports database failure without creating a portal", async () => {
        query({ data: null, error: { message: "Database unavailable" } });
        const response = await portal(request("portal"));
        expect(response.status).toBe(500);
        expect((await response.json()).error.code).toBe("database_error");
        expect(mocks.retrieve).not.toHaveBeenCalled();
        expect(mocks.portal).not.toHaveBeenCalled();
    });

    it("keeps the missing billing account response", async () => {
        query({ data: null, error: null });
        expect((await portal(request("portal"))).status).toBe(400);
        expect(mocks.portal).not.toHaveBeenCalled();
    });
});

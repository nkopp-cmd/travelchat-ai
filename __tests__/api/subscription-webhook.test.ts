// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    admin: vi.fn(), retrieve: vi.fn(), customer: vi.fn(), send: vi.fn(),
    headers: new Headers(), invalidate: vi.fn(), template: vi.fn(() => null),
}));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mocks.send } }, FROM_EMAIL: "test@example.com" }));
vi.mock("@/emails/subscription-email", () => ({ SubscriptionEmail: mocks.template }));
vi.mock("@/lib/cache", () => ({ invalidateUserCache: mocks.invalidate }));
// Keep the shipped signature helper and real SDK verification. Mock only network methods.
vi.mock("@/lib/stripe", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/stripe")>();
    actual.stripe!.subscriptions.retrieve = mocks.retrieve;
    actual.stripe!.customers.retrieve = mocks.customer;
    return actual;
});

const secret = "whsec_offline_test_only";
const sdk = new Stripe("sk_test_offline_only");
let post: typeof import("@/app/api/subscription/webhook/route").POST;
type Result = { data: unknown; error: unknown };
let results: Result[];
let persistedSubscription: unknown;
let queries: Array<{ table: string; operation?: string; value?: unknown; columns?: string; filters: Record<string, unknown> }>;

function subscription(status = "active") {
    return {
        id: "sub_A", customer: { id: "cus_A" }, metadata: { clerk_user_id: "user_A" }, status,
        items: { data: [{ price: { id: "price_pro", recurring: { interval: "month" } },
            current_period_start: 1000, current_period_end: 2000 }] },
        cancel_at_period_end: false,
    };
}
function invoice(legacy = false, expanded = true) {
    const ref = expanded ? { id: "sub_A" } : "sub_A";
    return { customer: { id: "cus_A" }, ...(legacy ? { subscription: ref } :
        { parent: { type: "subscription_details", subscription_details: { subscription: ref } } }) };
}
async function request(type: string, object: unknown, signature?: string | null, suffix = "") {
    const body = JSON.stringify({ id: "evt_offline", object: "event", type, data: { object } });
    mocks.headers = new Headers();
    if (signature !== null) mocks.headers.set("stripe-signature", signature ??
        sdk.webhooks.generateTestHeaderString({ payload: body, secret }));
    return post(new NextRequest("https://localley.io/api/subscription/webhook", { method: "POST", body: body + suffix }));
}

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_offline_only");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    vi.stubEnv("STRIPE_PRO_MONTHLY_PRICE_ID", "price_pro");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    results = [];
    persistedSubscription = null;
    queries = [];
    mocks.admin.mockImplementation(() => ({ from: (table: string) => {
        const query: typeof queries[number] = { table, filters: {} };
        queries.push(query);
        const builder = {
            upsert: (value: unknown) => { query.operation = "upsert"; query.value = value; return builder; },
            update: (value: unknown) => { query.operation = "update"; query.value = value; return builder; },
            select: (columns: string) => { query.columns = columns; return builder; },
            eq: (key: string, value: unknown) => { query.filters[key] = value; return builder; },
            maybeSingle: () => builder,
            then: (resolve: (result: Result) => unknown) => {
                const result = results.shift() ?? {
                    data: table === "users" ? { email: "test@example.com", email_preferences: { product_updates: true } } : [{ clerk_user_id: "user_A" }],
                    error: null,
                };
                if (table === "subscriptions" && query.operation && !result.error) persistedSubscription = query.value;
                return Promise.resolve(resolve(result));
            },
        };
        return builder;
    } }));
    mocks.retrieve.mockResolvedValue(subscription());
    mocks.send.mockResolvedValue({ data: { id: "email_offline" }, error: null });
    mocks.customer.mockResolvedValue({ id: "cus_A", metadata: { clerk_user_id: "user_A" } });
    ({ POST: post } = await import("@/app/api/subscription/webhook/route"));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("offline Stripe signatures", () => {
    it.each(["missing", "bad", "expired", "tampered"])("rejects %s before database access", async (kind) => {
        const type = "customer.subscription.updated";
        const object = subscription();
        const body = JSON.stringify({ id: "evt_offline", object: "event", type, data: { object } });
        const signature = kind === "missing" ? null : kind === "bad" ? "t=123,v1=bad" :
            sdk.webhooks.generateTestHeaderString({ payload: body, secret,
                timestamp: kind === "expired" ? Math.floor(Date.now() / 1000) - 600 : undefined });
        expect((await request(type, object, signature, kind === "tampered" ? " " : "")).status).toBe(400);
        expect(mocks.admin).not.toHaveBeenCalled();
        expect(mocks.retrieve).not.toHaveBeenCalled();
        expect(mocks.send).not.toHaveBeenCalled();
    });
});

it.each([
    ["active", "active"], ["trialing", "trialing"], ["past_due", "past_due"],
    ["canceled", "canceled"], ["unpaid", "canceled"], ["incomplete", "canceled"],
    ["incomplete_expired", "canceled"], ["paused", "canceled"], ["future_status", "canceled"],
])("maps %s conservatively to %s", async (status, expected) => {
    expect((await request("customer.subscription.updated", subscription(status))).status).toBe(200);
    expect(queries[0].value).toMatchObject({ status: expected });
    if (status !== "active" && status !== "canceled") expect(mocks.send).not.toHaveBeenCalled();
});

it.each([false, true])("reads item periods with legacy fallback=%s", async (legacy) => {
    const sub = { ...subscription(), current_period_start: 3000, current_period_end: 4000 };
    if (legacy) sub.items.data = [{ price: sub.items.data[0].price } as typeof sub.items.data[number]];
    await request("customer.subscription.created", sub);
    expect(queries[0].value).toMatchObject({ stripe_customer_id: "cus_A",
        current_period_start: new Date((legacy ? 3000 : 1000) * 1000).toISOString(),
        current_period_end: new Date((legacy ? 4000 : 2000) * 1000).toISOString() });
});

it.each(["customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed", "checkout.session.completed"])("returns 500 on %s write error before email", async (type) => {
    results.push({ data: null, error: { message: "database unavailable" } });
    mocks.retrieve.mockResolvedValue(subscription("past_due"));
    const object = type.startsWith("invoice") ? invoice() : type.startsWith("checkout") ?
        { mode: "subscription", metadata: { clerk_user_id: "user_A" }, customer: "cus_A", subscription: "sub_A" } : subscription();
    expect((await request(type, object)).status).toBe(500);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(persistedSubscription).toBeNull();
});

it("acknowledges a persisted subscription on an optional profile read error", async () => {
    results.push({ data: [], error: null }, { data: null, error: { message: "read failed" } });
    expect((await request("customer.subscription.updated", subscription())).status).toBe(200);
    expect(persistedSubscription).toMatchObject({ tier: "pro", status: "active" });
    expect(mocks.send).not.toHaveBeenCalled();
});

it("selects the existing username column and preserves the template greeting", async () => {
    results.push({ data: [], error: null }, {
        data: { email: "test@example.com", username: "local_explorer", email_preferences: { product_updates: true } }, error: null,
    });
    expect((await request("customer.subscription.updated", subscription())).status).toBe(200);
    expect(queries.find(query => query.table === "users")).toMatchObject({
        columns: "email, username, email_preferences", filters: { clerk_id: "user_A" },
    });
    expect(mocks.template).toHaveBeenCalledWith(expect.objectContaining({ userName: "local_explorer" }));
    expect(mocks.send).toHaveBeenCalledOnce();
});

it("skips email for a missing email_preferences column after persistence", async () => {
    results.push({ data: [], error: null }, {
        data: null, error: { code: "42703", message: "column users.email_preferences does not exist" },
    });
    expect((await request("customer.subscription.updated", subscription())).status).toBe(200);
    expect(persistedSubscription).toMatchObject({ tier: "pro", status: "active" });
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Optional subscription email failed");
    expect(mocks.template).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
});

it.each(["customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"])("scopes %s and ignores replaced A without email", async (type) => {
    results.push({ data: [], error: null });
    mocks.retrieve.mockResolvedValue(subscription("past_due"));
    expect((await request(type, type.startsWith("invoice") ? invoice() : subscription())).status).toBe(200);
    expect(queries[0]).toMatchObject({ operation: "update", filters: {
        clerk_user_id: "user_A", stripe_subscription_id: "sub_A", stripe_customer_id: "cus_A",
    } });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
});

it.each([false, true])("supports invoice legacy=%s with string and expanded references", async (legacy) => {
    for (const expanded of [false, true]) {
        mocks.retrieve.mockResolvedValue(subscription("paused"));
        expect((await request("invoice.payment_succeeded", invoice(legacy, expanded))).status).toBe(200);
        expect(mocks.retrieve).toHaveBeenLastCalledWith("sub_A");
        expect(queries.at(-1)?.value).toMatchObject({ status: "canceled" });
    }
});

it("rejects invoice customer mismatch without writing", async () => {
    expect((await request("invoice.paid", { ...invoice(), customer: "cus_other" })).status).toBe(500);
    expect(queries).toHaveLength(0);
});

it("does not treat an absent price as a paid price", async () => {
    await request("customer.subscription.updated", { ...subscription(), items: { data: [] } });
    expect(queries[0].value).toMatchObject({ tier: "free" });
    expect(mocks.send).not.toHaveBeenCalled();
});

it.each([
    null,
    { email: "test@example.com", email_preferences: null },
    { email: "test@example.com", email_preferences: {} },
    { email: "test@example.com", email_preferences: { product_updates: false } },
])("skips email without explicit consent after a successful write: %j", async (profile) => {
    results.push({ data: [], error: null }, {
        data: profile, error: null,
    });
    expect((await request("customer.subscription.updated", subscription())).status).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.template).not.toHaveBeenCalled();
    expect(persistedSubscription).toMatchObject({ tier: "pro", status: "active" });
});

it.each(["rejected", "returned"])("acknowledges persistence after a %s email provider failure without logging PII", async (kind) => {
    const error = new Error("Provider rejected test@example.com local_explorer");
    if (kind === "rejected") mocks.send.mockRejectedValueOnce(error);
    else mocks.send.mockResolvedValueOnce({ data: null, error });
    expect((await request("customer.subscription.updated", subscription())).status).toBe(200);
    expect(persistedSubscription).toMatchObject({ tier: "pro", status: "active" });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Optional subscription email failed");
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain("test@example.com");
});

it("does not downgrade a recovered subscription for an old failed invoice", async () => {
    expect((await request("invoice.payment_failed", invoice())).status).toBe(200);
    expect(queries[0].value).toMatchObject({ status: "active" });
    expect(mocks.send).not.toHaveBeenCalled();
});

it("returns 500 without writing when checkout retrieval fails", async () => {
    mocks.retrieve.mockRejectedValue(new Error("Stripe unavailable"));
    expect((await request("checkout.session.completed", { mode: "subscription", metadata: { clerk_user_id: "user_A" },
        customer: "cus_A", subscription: "sub_A" })).status).toBe(500);
    expect(queries).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
});

it.each(["trialing", "incomplete", "canceled"])("checkout synchronizes actual %s instead of active", async (status) => {
    mocks.retrieve.mockResolvedValue(subscription(status));
    await request("checkout.session.completed", { mode: "subscription", metadata: { clerk_user_id: "user_A" },
        customer: { id: "cus_A" }, subscription: { id: "sub_A", status: "active" } });
    expect(queries[0].value).toMatchObject({ status: status === "incomplete" ? "canceled" : status });
    if (status === "canceled") expect(queries[0].operation).toBe("update");
});

it.each(["metadata", "customer", "subscription", "deleted_customer", "customer_metadata"])("rejects checkout %s mismatch", async (kind) => {
    const sub = subscription();
    if (kind === "metadata") sub.metadata.clerk_user_id = "other";
    if (kind === "customer") sub.customer.id = "other";
    if (kind === "subscription") sub.id = "other";
    mocks.retrieve.mockResolvedValue(sub);
    if (kind === "deleted_customer") mocks.customer.mockResolvedValue({ id: "cus_A", deleted: true });
    if (kind === "customer_metadata") mocks.customer.mockResolvedValue({ id: "cus_A", metadata: { clerk_user_id: "other" } });
    expect((await request("checkout.session.completed", { mode: "subscription", metadata: { clerk_user_id: "user_A" },
        customer: "cus_A", subscription: "sub_A" })).status).toBe(500);
    expect(queries).toHaveLength(0);
    expect(mocks.send).not.toHaveBeenCalled();
});

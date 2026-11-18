import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";

// Money path (push AJ2): the Stripe Connect webhook moves guide payouts between approved/processing,
// paid and failed. Real Stripe signatures; a recording Supabase fake checks every guarded update.
const SECRET = "whsec_connect_unit_test";
const mocks = vi.hoisted(() => {
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_unit_test";
  return { headers: vi.fn(), supabase: vi.fn() };
});
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.supabase }));
vi.mock("@/lib/stripe", async () => {
  const { default: StripeSdk } = await import("stripe");
  return { stripe: new StripeSdk("sk_test_unit") };
});

import { POST } from "@/app/api/connect/webhook/route";

type Op = { table: string; action: "select" | "update"; payload?: unknown; filters: [string, string, unknown][] };
function fakeSupabase(earning: Record<string, unknown> | null, updateError: unknown = null) {
  const ops: Op[] = [];
  const client = {
    from(table: string) {
      const op: Op = { table, action: "select", filters: [] };
      const builder = {
        select() { ops.push(op); return builder; },
        update(payload: unknown) { op.action = "update"; op.payload = payload; ops.push(op); return builder; },
        eq(col: string, val: unknown) { op.filters.push(["eq", col, val]); return builder; },
        in(col: string, val: unknown) { op.filters.push(["in", col, val]); return builder; },
        single: async () => ({ data: earning, error: earning ? null : { message: "not found" } }),
        then(resolve: (v: unknown) => unknown) { return Promise.resolve({ error: updateError }).then(resolve); },
      };
      return builder;
    },
  };
  return { client, ops, updates: () => ops.filter((o) => o.action === "update") };
}

const sdk = new Stripe("sk_test_unit");
function signedRequest(event: object, opts: { secret?: string; signature?: string | null } = {}) {
  const payload = JSON.stringify(event);
  const signature = opts.signature !== undefined ? opts.signature
    : sdk.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET });
  mocks.headers.mockResolvedValue(new Headers(signature ? { "stripe-signature": signature } : {}));
  return new NextRequest("https://www.localley.io/api/connect/webhook", { method: "POST", body: payload });
}
const evt = (type: string, object: object) => ({ id: "evt_1", object: "event", type, data: { object } });
const transfer = (earningId?: string, id = "tr_1") => ({ id, object: "transfer", amount: 1250, metadata: earningId ? { earning_id: earningId } : {} });

beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); mocks.supabase.mockReset(); mocks.headers.mockReset(); });

describe("POST /api/connect/webhook", () => {
  it("rejects a missing or wrongly signed request before any database call", async () => {
    expect((await POST(signedRequest(evt("account.updated", { id: "acct_1" }), { signature: null }))).status).toBe(400);
    expect((await POST(signedRequest(evt("account.updated", { id: "acct_1" }), { secret: "whsec_other" }))).status).toBe(400);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("account.updated copies onboarding and payout flags to the guide with that Stripe account", async () => {
    const db = fakeSupabase(null); mocks.supabase.mockReturnValue(db.client);
    const res = await POST(signedRequest(evt("account.updated", { id: "acct_9", details_submitted: true, charges_enabled: false, payouts_enabled: true })));
    expect(res.status).toBe(200);
    expect(db.updates()).toEqual([{ table: "guide_profiles", action: "update",
      payload: { stripe_onboarding_complete: true, stripe_charges_enabled: false, stripe_payouts_enabled: true },
      filters: [["eq", "stripe_account_id", "acct_9"]] }]);
  });

  it("transfer.created marks an approved/processing earning paid, keeps an existing paid_at, and is idempotent", async () => {
    const db = fakeSupabase({ id: "earn_1", status: "processing", stripe_transfer_id: null, paid_at: "2026-11-01T00:00:00.000Z" });
    mocks.supabase.mockReturnValue(db.client);
    expect((await POST(signedRequest(evt("transfer.created", transfer("earn_1"))))).status).toBe(200);
    expect(db.updates()).toEqual([{ table: "guide_earnings", action: "update",
      payload: { status: "paid", paid_at: "2026-11-01T00:00:00.000Z", stripe_transfer_id: "tr_1" },
      filters: [["eq", "id", "earn_1"], ["in", "status", ["approved", "processing"]]] }]);

    const again = fakeSupabase({ id: "earn_1", status: "paid", stripe_transfer_id: "tr_1", paid_at: "2026-11-01T00:00:00.000Z" });
    mocks.supabase.mockReturnValue(again.client);
    expect((await POST(signedRequest(evt("transfer.created", transfer("earn_1"))))).status).toBe(200);
    expect(again.updates()).toEqual([]);
  });

  it("transfer.reversed marks the earning failed, but ignores a reversal for a different transfer", async () => {
    const db = fakeSupabase({ id: "earn_2", status: "paid", stripe_transfer_id: "tr_2" });
    mocks.supabase.mockReturnValue(db.client);
    expect((await POST(signedRequest(evt("transfer.reversed", transfer("earn_2", "tr_2"))))).status).toBe(200);
    expect(db.updates()).toEqual([{ table: "guide_earnings", action: "update",
      payload: { status: "failed", paid_at: null, stripe_transfer_id: "tr_2" },
      filters: [["eq", "id", "earn_2"], ["in", "status", ["processing", "paid"]]] }]);

    const other = fakeSupabase({ id: "earn_2", status: "paid", stripe_transfer_id: "tr_OTHER" });
    mocks.supabase.mockReturnValue(other.client);
    expect((await POST(signedRequest(evt("transfer.reversed", transfer("earn_2", "tr_2"))))).status).toBe(200);
    expect(other.updates()).toEqual([]);
  });

  it("transfers without an earning_id and unknown events change nothing", async () => {
    const db = fakeSupabase({ id: "x", status: "approved" }); mocks.supabase.mockReturnValue(db.client);
    for (const e of [evt("transfer.created", transfer()), evt("transfer.reversed", transfer()), evt("payout.paid", { id: "po_1" })]) {
      expect((await POST(signedRequest(e))).status).toBe(200);
    }
    expect(db.ops).toEqual([]);
  });
});

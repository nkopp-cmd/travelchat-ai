// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import Stripe from "stripe";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";
const mocks = vi.hoisted(() => ({ reader: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({
  previewAppDataReader: mocks.reader,
}));
import {
  recordPreviewStripeEvent,
  verifyPreviewStripeEvent,
  readPreviewStripeBody,
  isPreviewStripeWebhookCandidate,
  PreviewStripeEventRejected,
  PreviewStripeSecretMissing,
} from "@/lib/app-data/preview-stripe-events";
import { previewBillingStatus } from "@/lib/app-data/preview-billing-status";
import { previewUserTier } from "@/lib/app-data/preview-user-tier";
import { previewStoryTier } from "@/lib/app-data/preview-story-tier";
let db: D1Sqlite;
let number = 0;
const t = Math.floor(Date.now() / 1000) - 500,
  original = process.env;
const sub = (owner = "one", changes: Record<string, unknown> = {}) => ({
  id: `sub_${owner}`,
  customer: `cus_${owner}`,
  metadata: { clerk_user_id: owner },
  status: "active",
  cancel_at_period_end: false,
  trial_end: null,
  current_period_end: t + 2678400,
  items: {
    data: [{ price: { id: "price_localley_preview_pro" }, quantity: 1 }],
  },
  ...changes,
});
const event = (
  type = "customer.subscription.updated",
  data: unknown = sub(),
  created = t,
) =>
  ({
    id: `evt_local_${++number}`,
    type,
    created,
    livemode: false,
    data: { object: data },
  }) as Stripe.Event;
const apply = (e: Stripe.Event) =>
  recordPreviewStripeEvent(e, JSON.stringify(e));
const state = () =>
  db.sqlite
    .prepare("SELECT * FROM preview_subscription_state ORDER BY ownerId")
    .all() as Record<string, unknown>[];
const ledger = () =>
  db.sqlite.prepare("SELECT * FROM preview_stripe_events").all();
const legacyHash = () =>
  createHash("sha256")
    .update(
      JSON.stringify(
        db.sqlite.prepare("SELECT * FROM legacy_subscriptions").all(),
      ),
    )
    .digest("hex");
beforeEach(() => {
  process.env = {
    ...original,
    BETA_MODE: "false",
    AUTH_MAIL_MODE: "outbox",
    SUPABASE_READ_ONLY: "true",
    PREVIEW_STRIPE_WEBHOOK_SECRET: "whsec_unit_localley",
    PREVIEW_STRIPE_PRICE_TIERS: JSON.stringify({
      price_localley_preview_pro: "pro",
      price_localley_preview_premium: "premium",
    }),
  };
  db = new D1Sqlite();
  db.sqlite.exec(`PRAGMA foreign_keys=ON;
 CREATE TABLE owners(id TEXT PRIMARY KEY,source TEXT);INSERT INTO owners VALUES('auth:one','new'),('auth:two','new');
 CREATE TABLE legacy_owners(ownerId TEXT,clerkUserId TEXT);
 CREATE TABLE profiles(id TEXT PRIMARY KEY,ownerId TEXT);
 CREATE TABLE legacy_profile_emails(profileId TEXT,email TEXT);
 CREATE TABLE legacy_subscriptions(ownerId TEXT,tier TEXT,status TEXT,stripeCustomerId TEXT,stripeSubscriptionId TEXT,currentPeriodEnd TEXT,cancelAtPeriodEnd INTEGER,trialEnd TEXT,updatedAt TEXT);
 CREATE TABLE legacy_import_batches(counts TEXT);INSERT INTO legacy_import_batches VALUES('{"legacy_subscriptions":0,"profiles":0,"legacy_usage":0}');
 CREATE TABLE legacy_usage(ownerId TEXT,usageType TEXT,periodType TEXT,periodStart TEXT,count INTEGER);
 CREATE TABLE saved_spots(id TEXT,ownerId TEXT);
 CREATE TABLE preview_story_usage(ownerId TEXT,periodStart TEXT,count INTEGER);
 CREATE TABLE preview_chat_usage(ownerId TEXT,periodStart TEXT,count INTEGER);`);
  for (const file of [
    "0014_preview_stripe_events.sql",
    "0029_preview_subscription_state.sql",
  ])
    db.sqlite.exec(readFileSync(`migrations/app-preview/${file}`, "utf8"));
  // Actual serialized SQLite transactions, rather than the shared shim's Promise.all batch.
  let tail = Promise.resolve();
  db.batch = async (statements) => {
    const prior = tail;
    let release = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    db.sqlite.exec("BEGIN");
    try {
      const results: Awaited<ReturnType<typeof db.batch>> = [];
      for (const statement of statements) results.push(await statement.run());
      db.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      db.sqlite.exec("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  };
  mocks.reader.mockReturnValue(db);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("No external calls allowed"),
  );
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  db.sqlite.close();
  process.env = original;
  vi.restoreAllMocks();
});
async function readers(tier: string, status: string) {
  expect(await previewUserTier("one")).toBe(tier);
  expect(await previewStoryTier("one", null)).toBe(tier);
  expect(await previewBillingStatus("one", null)).toMatchObject({
    tier,
    status,
    isActive: ["active", "trialing"].includes(status),
  });
  expect(await previewUserTier("two")).toBe("free");
}
describe("transactional candidate subscription application", () => {
  it("verifies isolated signatures and preserves exact candidate gates", () => {
    const payload = JSON.stringify(event()),
      sdk = new Stripe("sk_test_signature_only"),
      signature = sdk.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.PREVIEW_STRIPE_WEBHOOK_SECRET!,
      });
    expect(verifyPreviewStripeEvent(payload, signature)?.livemode).toBe(false);
    expect(verifyPreviewStripeEvent(payload, "invalid")).toBeNull();
    process.env.PREVIEW_STRIPE_WEBHOOK_SECRET = "";
    expect(() => verifyPreviewStripeEvent(payload, signature)).toThrow(
      PreviewStripeSecretMissing,
    );
    expect(
      isPreviewStripeWebhookCandidate(
        new NextRequest(
          "https://localley-next-preview.nkopp.workers.dev/api/subscription/webhook?data_candidate=d1",
        ),
      ),
    ).toBe(true);
    expect(
      isPreviewStripeWebhookCandidate(
        new NextRequest(
          "https://www.localley.io/api/subscription/webhook?data_candidate=d1",
        ),
      ),
    ).toBe(false);
  });
  it("applies signed snapshots once and updates all subscription readers consistently", async () => {
    const e = event();
    expect(await apply(e)).toEqual({ recorded: true, applied: true });
    expect(await apply(e)).toEqual({ recorded: false, applied: false });
    expect(state()).toHaveLength(1);
    expect(ledger()).toHaveLength(1);
    await readers("pro", "active");
    await apply(
      event(
        undefined,
        sub("one", {
          status: "trialing",
          trial_end: t + 600,
          items: {
            data: [{ price: { id: "price_localley_preview_premium" } }],
          },
        }),
        t + 1,
      ),
    );
    await readers("premium", "trialing");
  });
  it("rejects same event ID payload conflicts atomically", async () => {
    const e = event();
    await apply(e);
    const changed = {
      ...e,
      data: { object: sub("one", { status: "past_due" }) },
    } as Stripe.Event;
    await expect(apply(changed)).rejects.toThrow(PreviewStripeEventRejected);
    expect(state()[0].status).toBe("active");
    expect(ledger()).toHaveLength(1);
  });
  it("ignores older snapshots and rejects ambiguous equal-second transitions", async () => {
    await apply(event(undefined, sub("one", { status: "past_due" }), t + 3));
    expect(await apply(event(undefined, sub(), t + 1))).toEqual({
      recorded: true,
      applied: false,
    });
    await readers("free", "past_due");
    const before = ledger().length;
    await expect(apply(event(undefined, sub(), t + 3))).rejects.toThrow(
      PreviewStripeEventRejected,
    );
    expect(ledger()).toHaveLength(before);
    expect(
      await apply(event(undefined, sub("one", { status: "past_due" }), t + 3)),
    ).toEqual({ recorded: true, applied: false });
  });
  it("serializes concurrent updates and replay admissions", async () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      event(undefined, sub("one", { cancel_at_period_end: !!(i % 2) }), t + i),
    );
    await Promise.all(events.reverse().map(apply));
    expect(state()[0].lastCreated).toBe(t + 7);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => apply(events[0])),
    );
    expect(results.every((x) => !x.applied && !x.recorded)).toBe(true);
  });
  it("rejects customer and owner rebinding without acknowledging the event", async () => {
    await apply(event());
    let count = ledger().length;
    await expect(
      apply(event(undefined, sub("one", { customer: "cus_changed" }), t + 1)),
    ).rejects.toThrow(PreviewStripeEventRejected);
    expect(ledger()).toHaveLength(count);
    await expect(
      apply(
        event(
          undefined,
          sub("two", { customer: "cus_one", id: "sub_one" }),
          t + 2,
        ),
      ),
    ).rejects.toThrow(PreviewStripeEventRejected);
    expect(ledger()).toHaveLength(count);
    count = ledger().length;
    await expect(apply(event(undefined, sub("missing")))).rejects.toThrow(
      PreviewStripeEventRejected,
    );
    expect(ledger()).toHaveLength(count);
  });
  it("keeps permanent tombstones through cancellation, replacement and late resurrection", async () => {
    await apply(event());
    await apply(event("customer.subscription.deleted", sub(), t + 1));
    await readers("free", "canceled");
    await expect(apply(event(undefined, sub(), t + 2))).rejects.toThrow(
      PreviewStripeEventRejected,
    );
    await apply(event(undefined, sub("one", { id: "sub_replacement" }), t + 3));
    await readers("pro", "active");
    await apply(
      event(
        "customer.subscription.deleted",
        sub("one", { id: "sub_replacement" }),
        t + 4,
      ),
    );
    await expect(apply(event(undefined, sub(), t + 5))).rejects.toThrow(
      PreviewStripeEventRejected,
    );
    expect(state()[0].stripeSubscriptionId).toBe("sub_replacement");
  });
  it("does not poison active state with a stale terminal event", async () => {
    await apply(event(undefined, sub(), t + 3));
    expect(
      await apply(event("customer.subscription.deleted", sub(), t + 1)),
    ).toEqual({ recorded: true, applied: false });
    expect(
      db.sqlite.prepare("SELECT * FROM preview_subscription_tombstones").all(),
    ).toHaveLength(0);
    await apply(
      event(undefined, sub("one", { cancel_at_period_end: true }), t + 4),
    );
    await readers("pro", "active");
  });
  it("permits a new subscription after canceling an imported active subscription", async () => {
    db.sqlite
      .exec(`INSERT INTO owners VALUES('legacy-one','legacy-fixture');DELETE FROM owners WHERE id='auth:one';INSERT INTO legacy_owners VALUES('legacy-one','one');
    INSERT INTO legacy_subscriptions VALUES('legacy-one','pro','active','cus_one','sub_one',NULL,0,NULL,'${new Date((t - 10) * 1000).toISOString()}');
    UPDATE legacy_import_batches SET counts='{"legacy_subscriptions":1,"profiles":0,"legacy_usage":0}';`);
    const hash = legacyHash();
    await apply(event("customer.subscription.deleted", sub(), t));
    await apply(event(undefined, sub("one", { id: "sub_replacement" }), t + 1));
    await readers("pro", "active");
    expect(legacyHash()).toBe(hash);
  });
  it("applies expanded checkout and invoice statuses without retrieving Stripe objects", async () => {
    const checkout = {
      id: "cs_preview",
      mode: "subscription",
      customer: "cus_one",
      metadata: { clerk_user_id: "one" },
      subscription: sub(),
    };
    await apply(event("checkout.session.completed", checkout));
    await readers("pro", "active");
    await apply(
      event(
        "invoice.payment_failed",
        {
          id: "in_failed",
          subscription: "sub_one",
          customer: "cus_one",
          paid: false,
        },
        t + 1,
      ),
    );
    await readers("free", "past_due");
    await apply(
      event(
        "invoice.paid",
        {
          id: "in_paid",
          parent: { subscription_details: { subscription: "sub_one" } },
          customer: "cus_one",
          paid: true,
        },
        t + 2,
      ),
    );
    await readers("pro", "active");
    await expect(
      apply(
        event(
          "checkout.session.completed",
          { ...checkout, subscription: "sub_one" },
          t + 3,
        ),
      ),
    ).rejects.toThrow("Expanded");
    await expect(
      apply(
        event(
          "invoice.paid",
          {
            id: "in_unknown",
            subscription: "sub_unknown",
            customer: "cus_one",
            paid: true,
          },
          t + 3,
        ),
      ),
    ).rejects.toThrow("unavailable");
  });
  it("copies the current subscription inside the invoice transaction after a concurrent upgrade", async () => {
    await apply(event());
    const saved = db.batch.bind(db);
    let entered = () => {},
      release = () => {};
    const arrived = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pause = true;
    db.batch = async (statements) => {
      if (pause) {
        pause = false;
        entered();
        await gate;
      }
      return saved(statements);
    };
    const invoice = apply(
      event(
        "invoice.paid",
        {
          id: "in_race",
          subscription: "sub_one",
          customer: "cus_one",
          paid: true,
        },
        t + 2,
      ),
    );
    await arrived;
    await apply(
      event(
        undefined,
        sub("one", {
          current_period_end: t + 5356800,
          items: {
            data: [{ price: { id: "price_localley_preview_premium" } }],
          },
        }),
        t + 1,
      ),
    );
    release();
    await invoice;
    await readers("premium", "active");
    expect(state()[0].currentPeriodEnd).toBe(
      new Date((t + 5356800) * 1000).toISOString(),
    );
  });
  it("rolls back the event ledger when entitlement storage fails", async () => {
    db.sqlite.exec(
      "CREATE TRIGGER fault BEFORE INSERT ON preview_subscription_state BEGIN SELECT RAISE(ABORT,'forced_storage_failure'); END;",
    );
    await expect(apply(event())).rejects.toThrow("forced_storage_failure");
    expect(ledger()).toHaveLength(0);
    expect(state()).toHaveLength(0);
  });
  it("uses immutable legacy state until newer events and refuses incomplete imports", async () => {
    db.sqlite
      .exec(`INSERT INTO owners VALUES('legacy-one','legacy-fixture');DELETE FROM owners WHERE id='auth:one';INSERT INTO legacy_owners VALUES('legacy-one','one');
    INSERT INTO legacy_subscriptions VALUES('legacy-one','pro','active','cus_one','sub_one',NULL,0,NULL,'${new Date((t + 10) * 1000).toISOString()}');
    UPDATE legacy_import_batches SET counts='{"legacy_subscriptions":1,"profiles":0,"legacy_usage":0}';`);
    const hash = legacyHash();
    expect(await apply(event())).toEqual({ recorded: true, applied: false });
    expect(state()).toHaveLength(0);
    await apply(event(undefined, sub("one", { status: "past_due" }), t + 11));
    await readers("free", "past_due");
    expect(legacyHash()).toBe(hash);
    db.sqlite.exec("UPDATE legacy_import_batches SET counts='{}'");
    await expect(apply(event(undefined, sub(), t + 12))).rejects.toThrow(
      "incomplete",
    );
  });
  it("refuses live, unknown-price, malformed or unresolved identity snapshots before writes", async () => {
    await expect(
      apply({ ...event(), livemode: true } as Stripe.Event),
    ).rejects.toThrow(PreviewStripeEventRejected);
    await expect(
      apply(
        event(
          undefined,
          sub("one", { items: { data: [{ price: { id: "price_unknown" } }] } }),
        ),
      ),
    ).rejects.toThrow("Unknown");
    await expect(
      apply(event(undefined, sub("one", { current_period_end: "wrong" }))),
    ).rejects.toThrow("date");
    expect(ledger()).toHaveLength(0);
    expect(state()).toHaveLength(0);
  });
  it("applies an exact pre-migration metadata replay and records unsupported events without state", async () => {
    const e = event(),
      payload = JSON.stringify(e),
      hash = createHash("sha256").update(payload).digest("hex");
    db.sqlite
      .prepare(
        "INSERT INTO preview_stripe_events(id,eventType,stripeCreated,livemode,objectId,payloadSha256) VALUES(?,?,?,0,?,?)",
      )
      .run(e.id, e.type, e.created, "sub_one", hash);
    expect(await apply(e)).toEqual({ recorded: false, applied: true });
    expect(await apply(event("ignored.event"))).toEqual({
      recorded: true,
      applied: false,
    });
  });
  it("shows candidate weighted counters instead of double-counting imported baselines", async () => {
    const month = new Date().toISOString().slice(0, 7) + "-01",
      day = new Date().toISOString().slice(0, 10);
    db.sqlite
      .prepare(
        "INSERT INTO legacy_usage VALUES('auth:one','ai_images_generated','monthly',?,4)",
      )
      .run(month);
    db.sqlite
      .prepare("INSERT INTO preview_story_usage VALUES('auth:one',?,6)")
      .run(month);
    db.sqlite
      .prepare("INSERT INTO preview_chat_usage VALUES('auth:one',?,3)")
      .run(day);
    db.sqlite.exec("INSERT INTO saved_spots VALUES('saved','auth:one')");
    expect(await previewBillingStatus("one", null)).toMatchObject({
      usage: { aiImagesThisMonth: 6, chatMessagesToday: 3, savedSpots: 1 },
    });
  });
  it("bounds the raw signature body before parsing", async () => {
    const small = new Request("https://example.test", {
      method: "POST",
      body: '{"raw":true}',
    });
    expect(await readPreviewStripeBody(small)).toBe('{"raw":true}');
    const big = new Request("https://example.test", {
      method: "POST",
      body: "x".repeat(262145),
    });
    expect(await readPreviewStripeBody(big)).toBeNull();
  });
});

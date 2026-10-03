import "server-only";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { ownerIds } from "./preview-conversations";
import { previewAppDataReader } from "./preview-db";
import { PreviewStripeEventRejected } from "./preview-stripe-errors";

interface State {
  ownerId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  tier: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: number;
  trialEnd: string | null;
  deleted: number;
}
const object = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const identifier = (v: unknown, prefix: string) =>
  typeof v === "string" && new RegExp(`^${prefix}_[A-Za-z0-9_]{1,190}$`).test(v)
    ? v
    : null;
function reject(message: string): never {
  throw new PreviewStripeEventRejected(message);
}
function date(v: unknown, required = false): string | null {
  if (v === null || v === undefined) {
    if (required) reject("Subscription period missing");
    return null;
  }
  if (!Number.isSafeInteger(v) || Number(v) <= 0 || Number(v) > 253402300799)
    reject("Invalid subscription date");
  return new Date(Number(v) * 1000).toISOString();
}
function priceTier(id: unknown): string {
  let prices: unknown;
  try {
    prices = JSON.parse(process.env.PREVIEW_STRIPE_PRICE_TIERS ?? "{}");
  } catch {
    reject("Preview price map invalid");
  }
  const entries = Object.entries(object(prices));
  if (
    !entries.length ||
    entries.length > 4 ||
    entries.some(
      ([k, v]) =>
        !identifier(k, "price") || !["pro", "premium"].includes(String(v)),
    )
  )
    reject("Preview prices unavailable");
  if (typeof id !== "string" || !Object.hasOwn(object(prices), id))
    reject("Unknown preview subscription price");
  return String(object(prices)[id]);
}
async function snapshot(value: unknown, deleted: boolean): Promise<State> {
  const s = object(value),
    metadata = object(s.metadata),
    userId = metadata.clerk_user_id;
  const sub = identifier(s.id, "sub"),
    customer = identifier(
      typeof s.customer === "string" ? s.customer : object(s.customer).id,
      "cus",
    );
  if (
    typeof userId !== "string" ||
    !userId ||
    userId.length > 100 ||
    !sub ||
    !customer
  )
    reject("Subscription identity missing");
  const ids = await ownerIds(userId);
  if (!!ids.legacy === !!ids.fresh)
    reject("Exact subscription owner unavailable");
  const rawStatus = deleted ? "canceled" : s.status;
  const status = rawStatus === "unpaid" ? "canceled" : rawStatus;
  if (
    typeof status !== "string" ||
    ![
      "active",
      "trialing",
      "past_due",
      "canceled",
      "incomplete",
      "incomplete_expired",
      "paused",
    ].includes(status)
  )
    reject("Unknown subscription status");
  const terminal =
    deleted || status === "canceled" || status === "incomplete_expired";
  const items = object(s.items).data;
  if (!terminal && (!Array.isArray(items) || items.length !== 1))
    reject("One subscription price required");
  const item = Array.isArray(items) ? object(items[0]) : {};
  if (!terminal && item.quantity !== undefined && item.quantity !== 1)
    reject("Unsupported subscription quantity");
  const period = date(
    s.current_period_end ?? item.current_period_end,
    !terminal,
  );
  if (typeof s.cancel_at_period_end !== "boolean" && !deleted)
    reject("Cancellation flag missing");
  return {
    ownerId: (ids.legacy ?? ids.fresh)!,
    stripeSubscriptionId: sub,
    stripeCustomerId: customer,
    tier: terminal ? "free" : priceTier(object(item.price).id),
    status,
    currentPeriodEnd: period,
    cancelAtPeriodEnd: terminal ? 0 : Number(s.cancel_at_period_end),
    trialEnd: terminal ? null : date(s.trial_end),
    deleted: Number(terminal),
  };
}
/** Snapshot handlers never retrieve Stripe objects. Thin checkout/invoice events fail closed. */
async function eventState(event: Stripe.Event): Promise<State | null> {
  const data = object(event.data.object);
  if (event.type.startsWith("customer.subscription.")) {
    if (
      ![
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type)
    )
      return null;
    return snapshot(data, event.type === "customer.subscription.deleted");
  }
  if (event.type === "checkout.session.completed") {
    if (
      data.mode !== "subscription" ||
      typeof data.subscription !== "object" ||
      !data.subscription
    )
      reject("Expanded checkout subscription required");
    const state = await snapshot(data.subscription, false);
    if (
      identifier(
        typeof data.customer === "string"
          ? data.customer
          : object(data.customer).id,
        "cus",
      ) !== state.stripeCustomerId
    )
      reject("Checkout customer mismatch");
    const user = object(data.metadata).clerk_user_id;
    if (user !== object(object(data.subscription).metadata).clerk_user_id)
      reject("Checkout owner mismatch");
    return state;
  }
  if (
    [
      "invoice.paid",
      "invoice.payment_succeeded",
      "invoice.payment_failed",
    ].includes(event.type)
  ) {
    const subscription =
      data.subscription ??
      object(object(data.parent).subscription_details).subscription;
    const sub = identifier(
      typeof subscription === "string" ? subscription : object(subscription).id,
      "sub",
    );
    const customer = identifier(
      typeof data.customer === "string"
        ? data.customer
        : object(data.customer).id,
      "cus",
    );
    if (!sub || !customer) reject("Invoice binding missing");
    const rows = await previewAppDataReader()
      .prepare(
        `SELECT ownerId,tier,status,stripeCustomerId,stripeSubscriptionId,currentPeriodEnd,cancelAtPeriodEnd,trialEnd
      FROM preview_subscription_effective WHERE stripeSubscriptionId=? AND stripeCustomerId=? LIMIT 2`,
      )
      .bind(sub, customer)
      .all<State>();
    if (rows.results.length !== 1) reject("Invoice subscription unavailable");
    const before = rows.results[0];
    if (!["active", "trialing", "past_due"].includes(before.status))
      reject("Invoice cannot revive inactive subscription");
    const fail = event.type === "invoice.payment_failed";
    if (fail && data.paid !== false) reject("Paid failure invoice");
    if (!fail && data.paid !== true) reject("Unpaid success invoice");
    return { ...before, status: fail ? "past_due" : "active", deleted: 0 };
  }
  return null;
}
/** D1 batch is transactional. A conflict aborts the event insert and entitlement together. */
export async function applyPreviewSubscriptionEvent(
  event: Stripe.Event,
  payload: string,
): Promise<{ recorded: boolean; applied: boolean }> {
  const state = await eventState(event),
    db = previewAppDataReader(),
    hash = createHash("sha256").update(payload).digest("hex");
  const objectId = String(object(event.data.object).id);
  const ledger = db
    .prepare(
      `INSERT OR IGNORE INTO preview_stripe_events(id,eventType,stripeCreated,livemode,objectId,payloadSha256) VALUES(?,?,?,0,?,?)`,
    )
    .bind(event.id, event.type, event.created, objectId, hash);
  if (!state) {
    try {
      const result = await ledger.run();
      return { recorded: result.meta.changes === 1, applied: false };
    } catch (error) {
      if (error instanceof Error && /preview_billing_/.test(error.message))
        reject("Stripe event ID conflict");
      throw error;
    }
  }
  const baseline = await db
    .prepare(
      "SELECT updatedAt FROM legacy_subscriptions WHERE ownerId=? LIMIT 2",
    )
    .bind(state.ownerId)
    .all<{ updatedAt: string | null }>();
  if (
    baseline.results.length > 1 ||
    (baseline.results.length === 1 &&
      (!baseline.results[0].updatedAt ||
        !Number.isFinite(Date.parse(baseline.results[0].updatedAt))))
  )
    reject("Subscription baseline clock unavailable");
  const imports = await db
    .prepare("SELECT counts FROM legacy_import_batches LIMIT 2")
    .all<{ counts: string }>();
  const total = await db
    .prepare("SELECT count(*) AS n FROM legacy_subscriptions")
    .first<{ n: number }>();
  if (
    imports.results.length !== 1 ||
    !total ||
    JSON.parse(imports.results[0].counts).legacy_subscriptions !== total.n
  )
    reject("Subscription import incomplete");
  const clock =
    "coalesce((SELECT lastCreated FROM preview_subscription_state WHERE ownerId=?),(SELECT unixepoch(updatedAt) FROM legacy_subscriptions WHERE ownerId=?),0)";
  const invoice = event.type.startsWith("invoice.");
  const values = [
    state.ownerId,
    state.stripeSubscriptionId,
    state.stripeCustomerId,
    state.tier,
    state.status,
    state.currentPeriodEnd,
    state.cancelAtPeriodEnd,
    state.trialEnd,
    state.deleted,
    event.created,
    event.id,
  ];
  const selection = invoice
    ? `SELECT s.ownerId,s.stripeSubscriptionId,s.stripeCustomerId,s.tier,?,s.currentPeriodEnd,s.cancelAtPeriodEnd,s.trialEnd,0,?,?
    FROM preview_subscription_effective s WHERE s.stripeSubscriptionId=? AND s.stripeCustomerId=? AND s.status IN ('active','trialing','past_due')
    AND ${clock}<=?`
    : `SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${clock}<=?`;
  const bindings = invoice
    ? [
        state.status,
        event.created,
        event.id,
        state.stripeSubscriptionId,
        state.stripeCustomerId,
        state.ownerId,
        state.ownerId,
        event.created,
      ]
    : [...values, state.ownerId, state.ownerId, event.created];
  const write = db
    .prepare(
      `INSERT INTO preview_subscription_state(ownerId,stripeSubscriptionId,stripeCustomerId,tier,status,currentPeriodEnd,cancelAtPeriodEnd,trialEnd,deleted,lastCreated,lastEventId)
    ${selection}
    ON CONFLICT(ownerId) DO UPDATE SET stripeSubscriptionId=excluded.stripeSubscriptionId,stripeCustomerId=excluded.stripeCustomerId,
      tier=excluded.tier,status=excluded.status,currentPeriodEnd=excluded.currentPeriodEnd,cancelAtPeriodEnd=excluded.cancelAtPeriodEnd,
      trialEnd=excluded.trialEnd,deleted=excluded.deleted,lastCreated=excluded.lastCreated,lastEventId=excluded.lastEventId
    WHERE excluded.lastCreated>preview_subscription_state.lastCreated`,
    )
    .bind(...bindings);
  const statements = [ledger, write];
  if (state.deleted)
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO preview_subscription_tombstones(stripeSubscriptionId,ownerId,stripeCustomerId) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM preview_subscription_state s
      WHERE s.ownerId=? AND s.stripeSubscriptionId=? AND s.deleted=1)`,
        )
        .bind(
          state.stripeSubscriptionId,
          state.ownerId,
          state.stripeCustomerId,
          state.ownerId,
          state.stripeSubscriptionId,
        ),
    );
  try {
    const result = await db.batch(statements);
    return {
      recorded: result[0].meta.changes === 1,
      applied: result[1].meta.changes === 1,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      /preview_billing_|UNIQUE constraint failed/.test(error.message)
    )
      reject("Subscription event conflicts with stored state");
    throw error;
  }
}

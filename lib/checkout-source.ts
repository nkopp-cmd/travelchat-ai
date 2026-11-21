// Push BX1: the page a Stripe checkout started on, kept in the session metadata so checkout_paid
// can be counted per source (start -> paid for the 2026-12-19 offer check). Analytics only: never
// used for prices, access or entitlements.
export const CHECKOUT_SOURCES = ["pricing", "preview", "other"] as const;
export type CheckoutSource = (typeof CHECKOUT_SOURCES)[number];

export function isCheckoutSource(value: unknown): value is CheckoutSource {
  return typeof value === "string" && (CHECKOUT_SOURCES as readonly string[]).includes(value);
}

/** Funnel source for a paid checkout: the stored page, or "stripe" when it is missing or unknown. */
export function checkoutPaidSource(value: unknown): CheckoutSource | "stripe" {
  return isCheckoutSource(value) ? value : "stripe";
}

// Where Stripe sends the buyer back. Fixed paths per caller; undefined = the /pricing flow.
// Push BY1: "planner" = /pricing opened from the planner monthly limit; a paid return lands in the planner.
const CHECKOUT_RETURNS = {
  "itinerary-preview": { success: "/itineraries/preview?payment=success", cancel: "/itineraries/preview?payment=canceled" },
  planner: { success: "/itineraries/new?payment=success", cancel: "/pricing?canceled=true" },
} as const;
export type CheckoutReturnTo = keyof typeof CHECKOUT_RETURNS;
const DEFAULT_RETURN = { success: "/settings?subscription=success", cancel: "/pricing?canceled=true" } as const;

export function isCheckoutReturnTo(value: unknown): value is CheckoutReturnTo {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CHECKOUT_RETURNS, value);
}

/** Success and cancel paths for a returnTo value, or null when the value is not allowed. */
export function checkoutReturnPaths(returnTo: unknown): { success: string; cancel: string } | null {
  if (returnTo === undefined) return DEFAULT_RETURN;
  return isCheckoutReturnTo(returnTo) ? CHECKOUT_RETURNS[returnTo] : null;
}

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

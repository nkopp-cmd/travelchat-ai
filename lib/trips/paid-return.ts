/** Back from Stripe: the webhook can land after the browser. Re-read the plan this often, then stop. */
export const PAID_RETURN_MAX = 5;
export const PAID_RETURN_DELAY_MS = 2000;

export type PaidReturn = "paid" | "pending" | "stopped";

/**
 * Reads the tier until it is pro/premium, at most PAID_RETURN_MAX times, PAID_RETURN_DELAY_MS apart.
 * A failed read counts as a try. Never starts a checkout; the caller decides what a result means.
 */
export async function waitForPaidTier(
  readTier: () => Promise<string | null | undefined>,
  { stopped = () => false, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) }: { stopped?: () => boolean; sleep?: (ms: number) => Promise<void> } = {},
): Promise<PaidReturn> {
  for (let run = 1; run <= PAID_RETURN_MAX; run += 1) {
    if (stopped()) return "stopped";
    const tier = await readTier().catch(() => null);
    if (stopped()) return "stopped";
    if (tier === "pro" || tier === "premium") return "paid";
    if (run < PAID_RETURN_MAX) await sleep(PAID_RETURN_DELAY_MS);
  }
  return "pending";
}

/** Removes ?payment= from the address bar without a navigation. */
export function dropPaymentParam() { dropQueryParam("payment"); }

/** Removes one query parameter from the address bar without a navigation. */
export function dropQueryParam(name: string) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

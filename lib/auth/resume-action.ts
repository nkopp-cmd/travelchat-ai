/**
 * Resume one account-only action after sign-up/sign-in (Push AZ2).
 * The gate adds ?continue=<action> to the return path; back on the page, the first component that claims the
 * value drops it from the address bar (synchronously, so a second component or a re-render never runs it again).
 */
export const CONTINUE_PARAM = "continue";

/** Prefix of every spot save resume value. */
export const SAVE_SPOT_PREFIX = "save-spot:";

/** Spot save resume value; the spot id keeps a list of cards from saving every card. */
export function saveSpotAction(spotId: string): string {
  return `${SAVE_SPOT_PREFIX}${spotId}`;
}

/** Same-origin path with ?continue=<action> set (replaces an older value). */
export function withContinue(path: string, action: string): string {
  const url = new URL(path, "https://localley.invalid");
  url.searchParams.set(CONTINUE_PARAM, action);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Browser-only: true once when the address carries ?continue=<action>; the param is removed at the same time. */
export function claimContinue(action: string): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.searchParams.get(CONTINUE_PARAM) !== action) return false;
  url.searchParams.delete(CONTINUE_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

let sweepPending = false;

/**
 * Browser-only (Push BA3): after the current render's effects had their chance to claim, drop a ?continue=<prefix...>
 * value that no component claimed (card gone, list re-ordered, signed-out visitor on a shared link). Without this the
 * value stays in the address bar, is copied into shared links and could save a spot for the next person who signs in.
 */
export function dropUnclaimedContinue(prefix: string): void {
  if (typeof window === "undefined" || sweepPending) return;
  sweepPending = true;
  setTimeout(() => {
    sweepPending = false;
    const url = new URL(window.location.href);
    if (!url.searchParams.get(CONTINUE_PARAM)?.startsWith(prefix)) return;
    url.searchParams.delete(CONTINUE_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, 0);
}

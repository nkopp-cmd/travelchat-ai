/**
 * Where a signed-out tap on an account-only action goes (Push AG1).
 * New visitors get the form that creates an account; the sign-up page links to sign-in with the same
 * redirect_url, so members lose nothing. The visitor comes back to the page they were on.
 */
const AUTH_PAGE = /^\/(?:sign-in|sign-up)(?:[/?#]|$)/;

/** Same-origin path to return to after auth; anything else (absolute, protocol-relative, auth pages) -> "/". */
export function returnPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || AUTH_PAGE.test(path)) return "/";
  return path;
}

export function signUpGateHref(path: string | null | undefined): string {
  return `/sign-up?redirect_url=${encodeURIComponent(returnPath(path))}`;
}

export function signInGateHref(path: string | null | undefined): string {
  return `/sign-in?redirect_url=${encodeURIComponent(returnPath(path))}`;
}

/** Browser-only: the current page (path + query) as the return target. */
export function currentPagePath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

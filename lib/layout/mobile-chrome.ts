export const MOBILE_BOTTOM_NAV_HIDDEN_PATHS = [
  "/",
  "/sign-in",
  "/sign-up",
  "/itineraries/new",
] as const;

export function isMobileBottomNavHidden(pathname: string | null | undefined) {
  if (!pathname) return false;

  return MOBILE_BOTTOM_NAV_HIDDEN_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}


import { describe, expect, it } from "vitest";
import { isMobileBottomNavHidden } from "@/lib/layout/mobile-chrome";

describe("mobile chrome route behavior", () => {
  it.each(["/", "/sign-in", "/sign-in/sso-callback", "/sign-up", "/itineraries/new"])(
    "hides the mobile bottom nav on %s",
    (pathname) => {
      expect(isMobileBottomNavHidden(pathname)).toBe(true);
    },
  );

  it.each(["/dashboard", "/spots", "/templates", "/itineraries", "/itineraries/abc123"])(
    "keeps the mobile bottom nav on %s",
    (pathname) => {
      expect(isMobileBottomNavHidden(pathname)).toBe(false);
    },
  );
});


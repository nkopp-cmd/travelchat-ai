import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isPublicRoute } from "@/middleware";

describe("Clerk public route allowlist", () => {
  it.each([
    "/api/spots/social-submissions",
    "/api/spots/social-submissions/media-status?ids=invalid",
    "/api/cron/cleanup-stories",
    "/api/cron/process-social-submissions",
  ])("lets route-level security handle %s", (pathname) => {
    expect(isPublicRoute(new NextRequest(`https://www.localley.io${pathname}`))).toBe(true);
  });

  it("continues to protect private application routes", () => {
    expect(isPublicRoute(new NextRequest("https://www.localley.io/dashboard"))).toBe(false);
  });
});

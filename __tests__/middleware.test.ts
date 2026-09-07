import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isPublicRoute } from "@/middleware";

describe("Clerk public route allowlist", () => {
  it.each(["/api/spots/spot-1/reviews", "/api/spots/spot-1/reviews?sort=helpful", "/api/spots/spot-1/reviews/"])("allows anonymous GET %s", (path) => {
    expect(isPublicRoute(new NextRequest(`https://localley.io${path}`))).toBe(true);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])("protects %s on the review collection", (method) => {
    expect(isPublicRoute(new NextRequest("https://localley.io/api/spots/spot-1/reviews", { method }))).toBe(false);
  });

  it.each([
    "/api/spots/spot-1/reviews/review-1",
    "/api/spots/spot-1/reviews/review-1/helpful",
    "/api/spots/spot-1/reviews-extra",
    "/api/spots/spot-1",
  ])("keeps neighboring route %s protected", (path) => {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      expect(isPublicRoute(new NextRequest(`https://localley.io${path}`, { method }))).toBe(false);
    }
  });

  it.each([
    "/api/spots/social-submissions",
    "/api/spots/social-submissions/media-status?ids=invalid",
    "/api/cron/cleanup-stories",
    "/api/cron/process-social-submissions",
    "/api/cron/refresh-weekly-social-trends",
  ])("lets route-level security handle %s", (pathname) => {
    expect(isPublicRoute(new NextRequest(`https://www.localley.io${pathname}`))).toBe(true);
  });

  it("continues to protect private application routes", () => {
    expect(isPublicRoute(new NextRequest("https://www.localley.io/dashboard"))).toBe(false);
  });

  it("keeps the default-off multi-city preview behind Clerk", () => {
    expect(isPublicRoute(new NextRequest("https://www.localley.io/api/v2/trips/preview"))).toBe(false);
  });
});

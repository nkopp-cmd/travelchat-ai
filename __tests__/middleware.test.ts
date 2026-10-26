import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { isPublicRoute } from "@/middleware";

describe("preview D1 shared itinerary access", () => {
  it("opens only the exact candidate link on the isolated preview", () => {
    vi.stubEnv("AUTH_MAIL_MODE", "outbox");
    vi.stubEnv("SUPABASE_READ_ONLY", "true");
    const path = "/shared/deadbeef?data_candidate=d1";
    expect(isPublicRoute(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}`))).toBe(true);
    expect(isPublicRoute(new NextRequest("https://localley-next-preview.nkopp.workers.dev/shared/deadbeef"))).toBe(false);
    expect(isPublicRoute(new NextRequest(`https://www.localley.io${path}`))).toBe(false);
    expect(isPublicRoute(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}`, { method: "POST" }))).toBe(false);
    vi.stubEnv("SUPABASE_READ_ONLY", "false");
    expect(isPublicRoute(new NextRequest(`https://localley-next-preview.nkopp.workers.dev${path}`))).toBe(false);
    vi.unstubAllEnvs();
  });
});

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
    "/api/cron/ai-provider-probe",
  ])("lets route-level security handle %s", (pathname) => {
    expect(isPublicRoute(new NextRequest(`https://www.localley.io${pathname}`))).toBe(true);
  });

  it("opens story slide media to shared-page visitors (the route enforces owner/shared + unexpired)", () => {
    const id = "11111111-1111-4111-8111-111111111111", gen = "33333333-3333-4333-8333-333333333333";
    expect(isPublicRoute(new NextRequest(`https://www.localley.io/api/itineraries/${id}/story/media/${gen}/cover`))).toBe(true);
    expect(isPublicRoute(new NextRequest(`https://www.localley.io/api/itineraries/${id}/story/media/${gen}`))).toBe(false);
    expect(isPublicRoute(new NextRequest(`https://www.localley.io/api/itineraries/${id}/story/persist`))).toBe(false);
  });

  it("continues to protect private application routes", () => {
    expect(isPublicRoute(new NextRequest("https://www.localley.io/dashboard"))).toBe(false);
  });

  it("keeps the default-off multi-city preview behind Clerk", () => {
    expect(isPublicRoute(new NextRequest("https://www.localley.io/api/v2/trips/preview"))).toBe(false);
  });
});

describe("middleware matcher", () => {
    it("skips static images, including the AVIF hero variants", async () => {
        const { config } = await import("@/middleware");
        const pageMatcher = new RegExp(`^${config.matcher[0]}$`);
        for (const path of ["/images/landing/seoul-map-v1-m-828.avif", "/images/landing/seoul-map-v1-d-1280.webp", "/icon.png"]) {
            expect(pageMatcher.test(path), path).toBe(false);
        }
        expect(pageMatcher.test("/dashboard")).toBe(true);
    });
});

describe("Supabase exit write freeze (DATA_WRITE_FREEZE)", () => {
  it("refuses mutating requests with 503 + Retry-After, keeps reads and sign-in open", async () => {
    vi.stubEnv("DATA_WRITE_FREEZE", "true");
    const { writeFreeze } = await import("@/middleware");
    const req = (method: string, path: string) => new NextRequest(`https://www.localley.io${path}`, { method });
    const save = writeFreeze(req("POST", "/api/itineraries/save"))!;
    expect(save.status).toBe(503);
    expect(save.headers.get("Retry-After")).toBe("600");
    expect(writeFreeze(req("POST", "/api/subscription/webhook"))?.status).toBe(503);
    expect(writeFreeze(req("POST", "/itineraries/new"))?.status).toBe(503);
    expect(writeFreeze(req("GET", "/api/spots"))).toBeNull();
    expect(writeFreeze(req("POST", "/api/auth/sign-in/email"))).toBeNull();
    vi.stubEnv("DATA_WRITE_FREEZE", "");
    expect(writeFreeze(req("POST", "/api/itineraries/save"))).toBeNull();
    vi.unstubAllEnvs();
  });
});

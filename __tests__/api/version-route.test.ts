// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/version/route";
import { isPublicRoute } from "@/middleware";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/version (release lane smoke check)", () => {
  it("returns only the deployed commit, uncached, on a public route", async () => {
    vi.stubEnv("BUILD_SHA", "0123456789abcdef0123456789abcdef01234567");
    const response = GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ sha: "0123456789abcdef0123456789abcdef01234567" });
    expect(isPublicRoute(new NextRequest("https://www.localley.io/api/version"))).toBe(true);
  });

  it("returns null before a lane release has set BUILD_SHA", async () => {
    vi.stubEnv("BUILD_SHA", "");
    delete process.env.BUILD_SHA;
    expect(await GET().json()).toEqual({ sha: null });
  });
});

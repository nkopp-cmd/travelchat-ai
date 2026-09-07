import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", async importOriginal => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return { ...actual, clerkMiddleware: (handler: unknown) => handler };
});

import middleware from "@/middleware";

const run = middleware as unknown as (
  auth: { protect: (options?: { unauthenticatedUrl: string }) => Promise<void> },
  request: NextRequest,
) => Promise<void>;

describe("local sign-in continuation", () => {
  it.each(["/dashboard?tab=saved", "/settings", "/itineraries/trip-1", "/dashboard?redirect_url=https%3A%2F%2Fexample.invalid"])("keeps %s on the app origin", async path => {
    const protect = vi.fn().mockResolvedValue(undefined);
    await run({ protect }, new NextRequest(`https://www.localley.io${path}`));
    expect(protect).toHaveBeenCalledTimes(1);
    const destination = new URL(protect.mock.calls[0][0].unauthenticatedUrl);
    expect(destination.origin).toBe("https://www.localley.io");
    expect(destination.pathname).toBe("/sign-in");
    expect(destination.searchParams.get("redirect_url")).toBe(path);
    expect(new URL(destination.searchParams.get("redirect_url")!, destination.origin).origin).toBe(destination.origin);
  });

  it.each(["/api/spots/save", "/api/spots/spot-1/reviews", "/trpc/private"])("keeps API protection unchanged for %s", async path => {
    const protect = vi.fn().mockResolvedValue(undefined);
    await run({ protect }, new NextRequest(`https://www.localley.io${path}`, { method: "POST" }));
    expect(protect).toHaveBeenCalledWith();
  });

  it.each(["/spots", "/sign-in", "/api/spots/spot-1/reviews"])("does not protect public GET %s", async path => {
    const protect = vi.fn().mockResolvedValue(undefined);
    await run({ protect }, new NextRequest(`https://www.localley.io${path}`));
    expect(protect).not.toHaveBeenCalled();
  });
});

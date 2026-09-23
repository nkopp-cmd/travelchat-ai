import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isPublicRoute } from "@/middleware";

describe("venue photo metadata access", () => {
  it("allows anonymous gallery reads", () => {
    expect(isPublicRoute(new NextRequest("https://localley.io/api/spots/spot-1/photos"))).toBe(true);
  });
  it.each(["POST", "PATCH", "DELETE"])("does not expose %s photo mutations", method => {
    expect(isPublicRoute(new NextRequest("https://localley.io/api/spots/spot-1/photos", { method }))).toBe(false);
  });
  it("does not expose nested private routes", () => {
    expect(isPublicRoute(new NextRequest("https://localley.io/api/spots/spot-1/photos/private"))).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { freePlannerHref } from "@/lib/planner-href";

describe("freePlannerHref (Push AC1)", () => {
  it("preselects the trip city and encodes it", () => {
    expect(freePlannerHref("Seoul")).toBe("/itineraries/new?city=Seoul");
    expect(freePlannerHref(" Ho Chi Minh City ")).toBe("/itineraries/new?city=Ho+Chi+Minh+City");
  });

  it("falls back to the bare planner without a city", () => {
    expect(freePlannerHref()).toBe("/itineraries/new");
    expect(freePlannerHref("")).toBe("/itineraries/new");
    expect(freePlannerHref(null)).toBe("/itineraries/new");
  });

  it.each(["app/shared/[shareCode]/page.tsx", "app/users/[username]/page.tsx"])(
    "%s sends visitors to the free planner, never to a bare /sign-up",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/href=["']\/sign-up["']/);
      expect(source).toContain("freePlannerHref(");
    },
  );
});

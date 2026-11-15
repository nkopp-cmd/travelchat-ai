import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HELP_COUNTRIES } from "@/lib/help/phrases";
import { ALL_CITIES } from "@/lib/cities";
import { HELP_PLAN_CITY, HelpPlanLink, helpPlanHref } from "@/components/help/help-plan-link";

describe("help guide link to the free planner", () => {
  it("links each mapped country to its main planner city", () => {
    expect(helpPlanHref("korea")).toBe("/itineraries/new?city=Seoul");
    expect(helpPlanHref("singapore")).toBe("/itineraries/new?city=Singapore");
  });

  it("maps only real help countries to real enabled planner cities", () => {
    const countries = new Set<string>(HELP_COUNTRIES.map((c) => c.slug));
    for (const [slug, city] of Object.entries(HELP_PLAN_CITY)) {
      expect(countries.has(slug)).toBe(true);
      expect(ALL_CITIES.find((c) => c.name === city)?.isEnabled).toBe(true);
    }
  });

  it("renders a plain link with the free-plan line, and nothing for a country without a city", () => {
    const html = renderToStaticMarkup(<HelpPlanLink countrySlug="japan" />);
    expect(html).toContain('href="/itineraries/new?city=Tokyo"');
    expect(html).toContain("Plan a free day in Tokyo");
    expect(html).toContain("First plan free · no sign-up");
    expect(renderToStaticMarkup(<HelpPlanLink countrySlug="vietnam" />)).toBe("");
  });
});

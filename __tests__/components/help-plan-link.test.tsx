import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HELP_COUNTRIES } from "@/lib/help/phrases";
import { ALL_CITIES } from "@/lib/cities";
import { HELP_PLAN_CITY, HelpPlanLink, helpPlanHref } from "@/components/help/help-plan-link";
import HelpPage from "@/app/help/page";
import TrendingPage from "@/app/trending/page";

vi.mock("@/lib/viral/events", () => ({ fetchViralEvents: vi.fn(async () => []) }));
vi.mock("@/components/newsletter/localley-signup", () => ({ LocalleySignup: () => null }));

describe("help guide link to the free planner", () => {
  it("links each mapped country to its main planner city", () => {
    expect(helpPlanHref("korea")).toBe("/itineraries/new?city=Seoul");
    expect(helpPlanHref("singapore")).toBe("/itineraries/new?city=Singapore");
    expect(helpPlanHref("vietnam")).toBe("/itineraries/new?city=Hanoi");
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
    expect(renderToStaticMarkup(<HelpPlanLink countrySlug="laos" />)).toBe("");
  });

  // Push AL1: the planner CTA was a grey button whose long label was cut off on phones.
  it("renders the planner link as a primary button whose label wraps instead of truncating", () => {
    const html = renderToStaticMarkup(<HelpPlanLink countrySlug="japan" />);
    expect(html).toContain("bg-primary");
    expect(html).not.toContain("bg-secondary");
    expect(html).not.toContain("truncate");
    expect(html).toContain("min-h-12");
  });

  // Push X1: index pages in sitemaps/pages.xml had no planner link in server HTML on phones
  // (navbar "Start planning" is client-only and hidden below sm).
  it("puts a server-rendered free-planner link on /help and /trending", async () => {
    for (const html of [renderToStaticMarkup(<HelpPage />), renderToStaticMarkup(await TrendingPage())]) {
      expect(html).toContain('href="/itineraries/new"');
      expect(html).toContain("Plan a free trip");
      expect(html).toContain("First plan free · no sign-up");
    }
  });

  it("links every country's pay card from /help (Push CL4: /help/japan/pay had 0 inbound links)", () => {
    const html = renderToStaticMarkup(<HelpPage />);
    for (const country of HELP_COUNTRIES) expect(html).toContain(`href="/help/${country.slug}/pay"`);
  });

  it("gives the indexed /help page crawl paths to the Ring-1 city hubs and the templates", () => {
    const html = renderToStaticMarkup(<HelpPage />);
    for (const href of ["/spots?city=seoul", "/spots?city=tokyo", "/spots?city=bangkok", "/spots?city=singapore", "/templates"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });
});

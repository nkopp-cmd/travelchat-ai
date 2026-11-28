import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/templates",
  useSearchParams: () => new URLSearchParams(),
}));

import TemplatesPage from "@/app/templates/page";
import { getTemplateUrl } from "@/components/templates/template-picker";
import { templates } from "@/lib/templates";

// Signed-out money path: /templates -> free planner -> preview -> Save -> checkout.
// A link to a signed-in route here is a sign-in wall in front of the free plan.
const SIGNED_IN_ROUTES = /^\/(dashboard|sign-in|sign-up|settings|itineraries(?!\/new(\?|$)))/;

describe("/templates free path", () => {
  it("sends every plan link to the free planner, never to a signed-in route", () => {
    const { container } = render(<TemplatesPage />);
    const hrefs = [...container.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
    // /privacy and /newsletter (form fine print, push EK1) are public pages, not plan links.
    const internal = hrefs.filter((href) => href.startsWith("/") && href !== "/privacy" && href !== "/newsletter");

    expect(internal.some((href) => href.includes("template="))).toBe(true);
    expect(internal.filter((href) => SIGNED_IN_ROUTES.test(href))).toEqual([]);
    expect(internal.every((href) => href.startsWith("/itineraries/new"))).toBe(true);
    // Cards hidden by the pace filter use the same builder.
    for (const template of templates) {
      expect(getTemplateUrl(template)).toMatch(new RegExp(`^/itineraries/new\\?template=${template.id}&`));
    }
  });

  it("offers the custom free plan with the no-sign-up promise", () => {
    render(<TemplatesPage />);
    const custom = screen.getByRole("link", { name: "Plan a free trip" });
    expect(custom.getAttribute("href")).toBe("/itineraries/new");
    expect(custom.closest("div")?.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(screen.getByText(/First plan free, no sign-up/)).toBeTruthy();
  });

  it("keeps the heading order: one h1, card titles are h2", () => {
    const { container } = render(<TemplatesPage />);
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(container.querySelector("h3")).toBeNull();
    const names = [...container.querySelectorAll("h2")].map((h) => h.textContent);
    expect(names).toContain(templates[0].name);
  });

  it("has no complementary landmark inside main (axe landmark-complementary-is-top-level)", () => {
    const { container } = render(<TemplatesPage />);
    // The labelled newsletter <aside> passes axe live; an unlabelled one (the old summary panel) failed at 1280 px.
    expect(container.querySelectorAll("aside:not([aria-labelledby]):not([aria-label]), [role='complementary']")).toHaveLength(0);
  });
});

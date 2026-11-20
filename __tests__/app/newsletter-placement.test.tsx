import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import HelpPage from "@/app/help/page";
import BlogIndexPage from "@/app/blog/page";
import { NEWSLETTER_SUBSCRIBE_ACTION } from "@/components/newsletter/localley-signup";
import { cleanSource } from "@/lib/newsletter/store";

// Push AU1: the owned email list needs an entry point on the most visited public pages (owned_audience was 0).
function newsletterForms(container: HTMLElement) {
  return [...container.querySelectorAll(`form[action="${NEWSLETTER_SUBSCRIBE_ACTION}"]`)].map((form) => ({
    method: form.getAttribute("method"),
    source: form.querySelector<HTMLInputElement>('input[name="source"]')?.value,
    email: form.querySelector<HTMLInputElement>('input[name="email"]')?.required,
  }));
}

describe("newsletter form placement", () => {
  it.each([
    ["/help", HelpPage, "help-index"],
    ["/blog", BlogIndexPage, "blog-index"],
  ])("%s renders one plain POST form with its own source", (_route, Page, source) => {
    const { container } = render(<Page />);
    expect(newsletterForms(container)).toEqual([{ method: "post", source, email: true }]);
    expect(cleanSource(source)).toBe(source);
  });

  it("home renders the form once with source home", () => {
    const page = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
    expect(page.match(/<LocalleySignup\b[^>]*>/g)).toEqual([expect.stringContaining('source="home"')]);
    expect(cleanSource("home")).toBe("home");
  });

  it("pricing renders the form once with source pricing (Push BD1)", () => {
    const page = readFileSync(path.join(process.cwd(), "app/pricing/page.tsx"), "utf8");
    expect(page.match(/<LocalleySignup\b[^>]*>/g)).toEqual([expect.stringContaining('source="pricing"')]);
    expect(cleanSource("pricing")).toBe("pricing");
  });

  it("credits renders the form once with source credits and a planner link (Push BE2)", () => {
    const page = readFileSync(path.join(process.cwd(), "app/credits/page.tsx"), "utf8");
    expect(page.match(/<LocalleySignup\b[^>]*>/g)).toEqual([expect.stringContaining('source="credits"')]);
    expect(page).toContain('href="/itineraries/new"');
    expect(cleanSource("credits")).toBe("credits");
  });
});

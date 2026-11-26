// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LocalleySignup, NEWSLETTER_SUBSCRIBE_ACTION } from "@/components/newsletter/localley-signup";
import { cleanSource } from "@/lib/newsletter/store";
import { NEWSLETTER_STATES } from "@/lib/newsletter/states";
import NewsletterStatePage from "@/app/newsletter/[state]/page";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("LocalleySignup", () => {
  it("is a plain no-JS form posting to the double opt-in API with a hidden honeypot", () => {
    const html = renderToStaticMarkup(<LocalleySignup source="city-hub" city="seoul" />);
    expect(html).toContain(`action="${NEWSLETTER_SUBSCRIBE_ACTION}"`);
    expect(html).toContain('method="post"');
    expect(html).toMatch(/<input type="email"[^>]*required=""[^>]*name="email"/);
    expect(html).toContain('name="source" value="city-hub"');
    expect(html).toContain('name="city" value="seoul"');
    expect(html).toMatch(/<div aria-hidden="true"[^>]*><label[^>]*>Website<\/label><input[^>]*tabindex="-1"[^>]*name="website"/);
    expect(html).toContain('href="/privacy"');
    expect(html).not.toMatch(/<script|seoul-living|nilsgroove/i);
  });

  it("omits the city field when no city is given", () => {
    expect(renderToStaticMarkup(<LocalleySignup source="trending" />)).not.toContain('name="city"');
  });
});

describe("A-Z city hub sign-up (Push DP1)", () => {
  it("every /spots/a-z/<city> hub renders the sign-up with source city-az and the city slug", () => {
    const page = readFileSync(join(process.cwd(), "app/spots/a-z/[city]/page.tsx"), "utf8");
    expect(page).toMatch(/<LocalleySignup source="city-az" city=\{city\.slug\}/);
    expect(cleanSource("city-az")).toBe("city-az");
  });
});

describe("sign-up sources and answer pages", () => {
  // A source that fails the store rule is stored as "site": list analytics then lose the page.
  it("every LocalleySignup source used in app/ passes the store source rule", () => {
    const sources: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), "app"))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/<LocalleySignup\b[^>]*?source=(\{[^}]*\}|"[^"]*")/g)) {
        const raw = m[1];
        if (raw.startsWith('"')) sources.push(raw.slice(1, -1));
        else if (raw.includes("newsletter-${key}")) sources.push(...Object.keys(NEWSLETTER_STATES).map((k) => `newsletter-${k}`));
        else {
          const literals = [...raw.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
          expect(literals.length, `${file}: unknown dynamic source ${raw}`).toBeGreaterThan(0);
          sources.push(...literals);
        }
      }
    }
    expect(sources).toContain("preview");
    expect(sources.length).toBeGreaterThanOrEqual(6);
    for (const source of sources) expect(cleanSource(source), source).toBe(source);
  });

  it("every newsletter answer page links to the free planner", async () => {
    for (const state of Object.keys(NEWSLETTER_STATES)) {
      const html = renderToStaticMarkup(await NewsletterStatePage({ params: Promise.resolve({ state }) }));
      expect(html.match(/href="\/itineraries\/new"/g), state).toHaveLength(1);
      expect(html, state).toContain('href="/spots"');
    }
  });
});

describe("A-Z city hub planner CTA (Push DQ1)", () => {
  it("every /spots/a-z/<city> hub links to the free planner prefilled with the city, gated by planner cities", () => {
    const page = readFileSync(join(process.cwd(), "app/spots/a-z/[city]/page.tsx"), "utf8");
    expect(page).toMatch(/plannerCities\(\)/);
    expect(page).toMatch(/\/itineraries\/new\?\$\{new URLSearchParams\(\{ city: planCity \}\)\}/);
    expect(page).toMatch(/Plan a free \$\{planCity\} trip/);
    expect(page).toMatch(/data-testid="az-plan-trip"/);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Push AT1: the home page first paint must only style and lay out the hero. Every section below it carries
// .ll-below-fold (content-visibility: auto), and the hero itself never does (it is the LCP area).
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("home below-fold sections skip first-paint rendering", () => {
  it("globals.css defines content-visibility auto with a remembered intrinsic size", () => {
    const rule = /\.ll-below-fold\s*\{([^}]*)\}/.exec(read("app/globals.css"))?.[1] ?? "";
    expect(rule).toMatch(/content-visibility:\s*auto/);
    expect(rule).toMatch(/contain-intrinsic-size:\s*auto\s+\d+px/);
  });

  it("every home section after the hero and the footer carry the class", () => {
    const page = read("app/page.tsx");
    const tags = page.match(/<(section|footer)\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(4);
    const [hero, ...rest] = tags;
    expect(hero).not.toContain("ll-below-fold");
    for (const tag of rest) expect(tag).toContain("ll-below-fold");
    for (const file of ["components/landing/helpers.tsx", "components/landing/weekend-picks.tsx", "components/landing/guide-spot-links.tsx"]) {
      for (const tag of read(file).match(/<section\b[^>]*>/g) ?? []) expect(tag, file).toContain("ll-below-fold");
    }
    expect(read("components/landing/planner.tsx")).toMatch(/<section className="ll-below-fold[^"]*">/);
  });

  it("no below-fold section holds a fixed or sticky child (paint containment would clip it)", () => {
    for (const file of ["components/landing/helpers.tsx", "components/landing/weekend-picks.tsx", "components/landing/guide-spot-links.tsx", "components/landing/planner.tsx"]) {
      expect(read(file), file).not.toMatch(/\b(fixed|sticky)\b/);
    }
  });
});

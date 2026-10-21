import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("public page metadata and prefetch", () => {
  it("resolves URLs on localley.io and never inherits a root canonical or og:url", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain('metadataBase: new URL("https://www.localley.io")');
    expect(layout).not.toMatch(/localley\.ai/);
    expect(layout).not.toMatch(/alternates:\s*\{\s*canonical/);
    expect(layout.slice(layout.indexOf("openGraph:"), layout.indexOf("twitter:"))).not.toMatch(/\burl: "https?:\/\/[^"]+",\s*\n\s*siteName/);
    expect(layout).not.toMatch(/SpeedInsights/);
  });

  it("keeps /spots calls to action from prefetching the zod-heavy submission routes on view", () => {
    const page = readFileSync("app/spots/page.tsx", "utf8");
    for (const href of ["/itineraries/new", "/spots/submit", "/spots/submissions"]) {
      expect(page).toContain(`<IntentLink href="${href}">`);
    }
    expect(page).not.toMatch(/<Link href=/);
  });
});

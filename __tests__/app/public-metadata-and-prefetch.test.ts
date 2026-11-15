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

  it("blocks metadata into <head> for every client (no streamed title/canonical in the body)", async () => {
    const { default: config } = await import("../../next.config");
    const resolved = typeof config === "function" ? await (config as (phase: string) => Promise<{ htmlLimitedBots?: RegExp }>)("phase-production-build") : config;
    const bots = (resolved as { htmlLimitedBots?: RegExp }).htmlLimitedBots;
    expect(bots).toBeInstanceOf(RegExp);
    for (const ua of ["Mozilla/5.0 (Windows NT 10.0) Chrome/130", "Googlebot/2.1", "bingbot/2.0"]) expect(bots!.test(ua)).toBe(true);
  });

  it("keeps /spots calls to action from prefetching the zod-heavy submission routes on view", () => {
    const page = readFileSync("app/spots/page.tsx", "utf8");
    // The planner CTA carries the hub city (?city=), so its href is an expression.
    expect(page).toMatch(/<IntentLink href=\{[^\n]*`\/itineraries\/new\?/);
    for (const href of ["/spots/submit", "/spots/submissions"]) {
      expect(page).toContain(`<IntentLink href="${href}">`);
    }
    expect(page).not.toMatch(/<Link href=/);
  });
});

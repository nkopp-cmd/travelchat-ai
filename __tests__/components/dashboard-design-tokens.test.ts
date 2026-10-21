import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// shared/plans/localley-design-consistency.md batch 2: the dashboard uses tokens and the shared header.
const FILES = [
  "app/dashboard/page.tsx",
  "components/dashboard/mobile-dashboard-content.tsx",
  "components/dashboard/onboarding-panel.tsx",
  "components/dashboard/recent-stories.tsx",
  "components/dashboard/recommendations-widget.tsx",
];

describe("dashboard design tokens", () => {
  it.each(FILES)("%s has no legacy gradients, palette fills or coloured shadows", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/bg-gradient-to-(?:r|br|b)[^"']*(?:from|via|to)-(?:violet|indigo|purple|emerald|teal|amber|orange|rose|pink|blue)-/);
    expect(source).not.toMatch(/"from-[a-z]+-\d{3}(?:\/\d+)? (?:via|to)-/);
    expect(source).not.toMatch(/\bshadow-(?:violet|indigo|emerald|amber)-\d+\/\d+/);
    expect(source).not.toMatch(/bg-\[#[0-9a-f]{3,8}\]/i);
    expect(source).not.toMatch(/\bbg-white\/(?:\d|\[)/);
  });

  it("uses the shared page header on the mobile dashboard and the onboarding panel", () => {
    for (const file of ["components/dashboard/mobile-dashboard-content.tsx", "components/dashboard/onboarding-panel.tsx"]) {
      expect(readFileSync(file, "utf8")).toMatch(/<PageHeader\b/);
    }
  });
});

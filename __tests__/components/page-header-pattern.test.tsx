import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";

describe("shared page header and shell", () => {
  it("renders eyebrow, one h1, lede and actions", () => {
    render(<PageShell width="narrow"><PageHeader eyebrow="Community" title="Leaderboard" lede="Top explorers." actions={<button>Go</button>} /></PageShell>);
    expect(screen.getByRole("heading", { level: 1, name: "Leaderboard" })).toBeTruthy();
    expect(screen.getByText("Community")).toBeTruthy();
    expect(screen.getByText("Top explorers.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go" })).toBeTruthy();
  });

  it.each(["app/leaderboard/page.tsx", "app/challenges/page.tsx", "app/explore/page.tsx", "app/templates/page.tsx"])(
    "%s uses the shared header and shell, left aligned, without legacy gradients", (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/<PageHeader\b/);
      expect(source).toMatch(/<PageShell\b/);
      expect(source).not.toMatch(/text-center space-y-2|bg-gradient-to-|from-violet-|shadow-violet-/);
    });

  it("keeps the /spots reference on the shared eyebrow and surface tokens", () => {
    const source = readFileSync("app/spots/page.tsx", "utf8");
    expect(source).toMatch(/<PageEyebrow icon=\{MapPin\}/);
    expect(source).not.toMatch(/bg-\[#|bg-violet-400\/10|text-violet-50\//);
  });
});

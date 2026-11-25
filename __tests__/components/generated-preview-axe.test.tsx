import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import PreviewClient from "@/app/itineraries/preview/preview-client";
import { storeGeneratedPreview } from "@/lib/trips/generated-preview";

// Push DI2: the generated preview ("Save this trip" -> sign-up/checkout) needs a stored plan, so the live axe walk
// (scripts/a11y-money-pages.mjs) never reaches its trip states. Axe runs here on each state instead.
// jsdom has no layout, so colour contrast stays with the live walk and the design-token checks.
const state = vi.hoisted(() => ({ signed: false, query: "", push: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelStep: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }), useSearchParams: () => new URLSearchParams(state.query) }));
vi.mock("@/lib/auth/client", () => ({ useUser: () => ({ isLoaded: true, isSignedIn: state.signed, user: null }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const plan = {
  title: "Seoul without a rush", city: "Seoul", days: 2,
  dailyPlans: [
    { day: 1, theme: "A local afternoon", activities: [{ name: "Market walk", description: "Street food stalls", time: "14:00", address: "Mangwon-dong", duration: "2 h", cost: "₩15,000" }] },
    { day: 2, activities: [{ name: "Hanok tea", description: "Quiet tea house" }] },
  ],
  insights: ["Carry a T-money card.", { text: "Most markets close on Mondays." }],
};

async function blockingViolations(container: HTMLElement) {
  const result = await axe.run(container, {
    runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"],
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

const view = () => render(<main><PreviewClient initialDraft={null} /></main>);

beforeEach(() => {
  localStorage.clear(); state.signed = false; state.query = ""; state.push.mockReset(); state.fetch.mockReset();
  vi.stubGlobal("fetch", state.fetch);
});

describe("generated preview accessibility (Push DI2)", () => {
  it("the stored trip with both save buttons and the email form has no serious or critical violation", async () => {
    storeGeneratedPreview(localStorage, plan);
    const { container } = view();
    await screen.findByRole("heading", { name: plan.title, level: 1 });
    expect(screen.getByRole("button", { name: "Save this trip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save & unlock editing" })).toBeTruthy();
    expect(await blockingViolations(container)).toEqual([]);
  });

  it("the refused-checkout alert and the checkout-closed status stay accessible", async () => {
    storeGeneratedPreview(localStorage, plan);
    state.signed = true; state.query = "payment=canceled";
    state.fetch.mockResolvedValueOnce({ status: 402, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "Checkout is unavailable." } }) });
    const { container } = view();
    await screen.findByTestId("preview-checkout-closed");
    fireEvent.click(screen.getByRole("button", { name: "Save this trip" }));
    await screen.findByRole("alert");
    expect(await blockingViolations(container)).toEqual([]);
  });

  it.each([["no trip", ""], ["trip in another browser", "continue=save"]])("the %s state has no serious or critical violation", async (_name, query) => {
    state.query = query;
    const { container } = view();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
    expect(await blockingViolations(container)).toEqual([]);
  });

  it("headings go h1 -> h2 -> h3 without a skipped level", async () => {
    storeGeneratedPreview(localStorage, plan);
    const { container } = view();
    await screen.findByRole("heading", { name: plan.title, level: 1 });
    const levels = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
    levels.reduce((prev, level) => { expect(level - prev).toBeLessThanOrEqual(1); return level; }, 0);
  });
});

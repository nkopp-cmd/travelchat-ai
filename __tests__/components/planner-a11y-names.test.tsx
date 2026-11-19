import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/itineraries/wizard/wizard-context", () => ({ useWizard: () => ({ currentStep: 3, goToStep: vi.fn() }) }));
import { WizardProgress } from "@/components/itineraries/wizard/wizard-progress";
import { Slider } from "@/components/ui/slider";

// Push AO3, axe on the live planner 2026-11-19: Lighthouse saw only step 0 (score 1), but the
// later steps had unnamed controls: the desktop finished-step buttons (check icon only, critical
// button-name) and the slider thumbs (role="slider" without a name, serious aria-input-field-name).
describe("planner controls have accessible names", () => {
  it("names every progress step button, desktop and mobile, and marks the current step", () => {
    render(<WizardProgress />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(8);
    // Role queries compute the accessible name: all 8 buttons must match a "Step N: label" name.
    expect(screen.getAllByRole("button", { name: /^Step [1-4]: (Destination|Duration|Interests|Preferences)$/ })).toHaveLength(8);
    expect(screen.getAllByRole("button", { name: "Step 1: Destination" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Step 4: Preferences" }).some((b) => b.getAttribute("aria-current") === "step")).toBe(true);
  });

  it("puts the slider name on the thumb that has role=slider", () => {
    // Radix measures the thumb; jsdom lacks ResizeObserver.
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    render(<Slider value={[3]} min={1} max={5} step={1} aria-label="Localness level" />);
    expect(screen.getByRole("slider", { name: "Localness level" }).getAttribute("aria-valuenow")).toBe("3");
  });
});
